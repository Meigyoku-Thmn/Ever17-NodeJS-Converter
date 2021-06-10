import { createCStruct } from './helpers/frida-struct';
import {
   keep, wrapCdeclInStdcall, sendCommand, getScriptRecord, getLastError, decodeKeystrokeFlags, str, KEY_RELEASED,
} from './helpers/utils';
import {
   CallNextHookEx, DialogBoxParamFunc, LPARAM, LRESULT, DialogBoxParam, SetWindowsHookEx, VK_R, WH_KEYBOARD, WPARAM, SECURITY_ATTRIBUTES, CreatePipe, PROCESS_INFORMATION, STARTUPINFO, STARTF_USESTDHANDLES, CreateProcess, CloseHandle, WaitForSingleObject, INFINITE, GetExitCodeProcess, CreateCompatibleDC, BITMAPINFO, BI_RGB, CreateDIBSection, DIB_RGB_COLORS, SelectObject, BitBlt, SRCCOPY, WriteFile, STARTF_USESHOWWINDOW, GetStdHandle, STD_ERROR_HANDLE, STD_OUTPUT_HANDLE, SetHandleInformation, HANDLE_FLAG_INHERIT, SetBkColor, CLR_INVALID, SetTextColor, TextOut
} from './helpers/winapi';

console.log('shellcode.js executed.');

// -- ENABLE MODIFYING GAME SCRIPT ON-THE-FLY --
(function SetUpGameScriptModding() {
   type Metadata = Record<number, { fileSize: number, fileName: string }>;

   const ScriptMetadata = sendCommand('ScriptMetadata').message as Metadata;

   // hook the record loading function to patch the game script
   const FuncAddress = ptr(0x40D040);
   const FuncRetType = 'bool';
   const FuncArgTypes = ['pointer', 'pointer', 'int32', 'uint32'];
   const FuncCallConv = 'mscdecl';

   const OriReadBytes = new NativeFunction(FuncAddress, FuncRetType, FuncArgTypes, FuncCallConv);

   Interceptor.replace(FuncAddress,
      new NativeCallback((_fileName: NativePointer, buffer: NativePointer, _fileOffset: number, _readSize: number) => {
         const callDefaultRoutine = () => OriReadBytes(_fileName, buffer, _fileOffset, _readSize);
         const [fileName, fileOffset, readSize] = [_fileName.readAnsiString(), _fileOffset, _readSize];

         if (!fileName.endsWith('script.dat'))
            return callDefaultRoutine();

         const fileMetadata = ScriptMetadata?.[fileOffset];
         if (fileMetadata == null)
            return callDefaultRoutine();

         const newBuffer = getScriptRecord(fileMetadata.fileName);
         if (newBuffer == null)
            return callDefaultRoutine();

         console.log('Record name: ' + fileMetadata.fileName);

         const sizeDiff = newBuffer.byteLength - readSize;
         if (sizeDiff > 0)
            console.warn(`Warning: received data is ${sizeDiff} byte(s) bigger than allocated memory.`);

         buffer.writeByteArray(newBuffer);

         return 1;
      }, FuncRetType, FuncArgTypes, FuncCallConv)
   );
})();

// -- ENABLE RECORDING GAMEPLAY --
(function SetUpGameplayRecording() {
   // ffmpeg configuration
   const recordOutputPath = sendCommand('RecordOutputPath').message as string;
   console.log(`Using screen recording output path: "${recordOutputPath}".`);
   const width = 800;
   const height = 600;
   const ffmpegCmd = str([
      'ffmpeg',
      '-hide_banner -loglevel error -y',
      '-f rawvideo -vcodec rawvideo', // no container, no codec for input
      `-video_size ${width}x${height} -pix_fmt bgr24 -framerate 60`,
      '-i pipe:0', // input from stdin
      `-vcodec libxvid -qscale:v 3 -vf "vflip, tpad=stop_mode=clone:stop_duration=1" "${recordOutputPath}"`,
      // duplicate the last frame because ffmpeg and many players don't care about people's experiences
   ].join(' '));

   // every api calls share the same result variable for convenience
   let rs: SystemFunctionResult;

   // the main hdc of the program
   const g_hdc = ptr(0x004583BC);
   // in-memory hdc to store the frame from video memory
   let memDcHdc: number;
   const ppvBits = Memory.alloc(4);
   // initialize the in-memory hdc
   function InitializeBitmap() {
      if (!(rs = CreateCompatibleDC(g_hdc.readU32())).value)
         throw Error('CreateCompatibleDC failed, error code: ' + getLastError(rs));
      memDcHdc = rs.value as number;

      const bmi = createCStruct(BITMAPINFO);
      bmi.bmiHeader.biSize = bmi.bmiHeader.getSize();
      bmi.bmiHeader.biBitCount = 24;
      bmi.bmiHeader.biPlanes = 1;
      bmi.bmiHeader.biWidth = width;
      bmi.bmiHeader.biHeight = height;
      bmi.bmiHeader.biCompression = BI_RGB;

      rs = CreateDIBSection(memDcHdc, bmi.getPtr(), DIB_RGB_COLORS, ppvBits, 0, 0);
      if (!rs.value)
         throw Error('CreateDIBSection failed, error code: ' + getLastError(rs));

      rs = SelectObject(memDcHdc, rs.value);
      if (!rs.value || rs.value === -1)
         throw Error('SelectObject failed, error code: ' + getLastError(rs));

      rs = SetBkColor(memDcHdc, 0x00000000);
      if (rs.value === CLR_INVALID)
         console.error('SetBkColor failed, error code: ' + getLastError(rs));

      rs = SetTextColor(memDcHdc, 0x0000FF00);
      if (rs.value === CLR_INVALID)
         console.error('SetTextColor failed, error code: ' + getLastError(rs));
   }

   // two ends of a pipe, one for reading passed to ffmpeg, one for writing that we keep 
   const ffmpegStdinPtr = Memory.alloc(4);
   const ffmpegInputPtr = Memory.alloc(4);

   const ffmpegExitCodePtr = Memory.alloc(4);

   // accumulated state
   let recording = false;
   let pipeIsOpen = false;
   let recordingFailed = false;
   let initialized = false;
   let hasUnrecoverableError = false;
   let frameCount = 0;
   let procInfo = createCStruct(PROCESS_INFORMATION);
   const dwWritten = Memory.alloc(4); // dummy variable to satisfy an api call

   // make a state machine that can switch between some state: initializing, waiting, recording, tearing down, failed
   // this routine should be repeatedly called by a certain function in game (see UpdateFunc below)
   const RecordFrame = new NativeCallback(() => {
      if (hasUnrecoverableError === true)
         return;

      if (initialized === false) {
         try {
            InitializeBitmap();
            initialized = true;
         } catch (err) {
            console.error(err.stack);
            hasUnrecoverableError = true;
         }
      }

      // recording is just turned off but we still don't have ffmpeg exit code
      if (pipeIsOpen && !recording) {
         rs = CloseHandle(ffmpegInputPtr.readU32());
         if (!rs.value)
            console.log('CloseHandle failed (1), error code: ' + getLastError(rs));

         ffmpegInputPtr.writeU32(0);

         console.log('Wait for ffmpeg to exit...');
         WaitForSingleObject(procInfo.hProcess, INFINITE);
         if (!(rs = GetExitCodeProcess(procInfo.hProcess, ffmpegExitCodePtr)).value)
            console.error('Cannot get ffmpeg exit code, error code: ' + getLastError(rs));
         else {
            console.log('ffmpeg exit code: ' + ffmpegExitCodePtr.readU32());
         }

         rs = CloseHandle(procInfo.hProcess);
         if (!rs.value)
            console.log('CloseHandle failed (3), error code: ' + getLastError(rs));
         procInfo.hProcess = 0;

         pipeIsOpen = false;
         recordingFailed = false;
         frameCount = 0;
      }
      // recording is just turned on but ffmpeg is not opened yet
      else if (!pipeIsOpen && recording) {
         pipeIsOpen = true;
         try {
            procInfo = createCStruct(PROCESS_INFORMATION);
            const sAttr = createCStruct(SECURITY_ATTRIBUTES);
            sAttr.nLength = sAttr.getSize();
            sAttr.bInheritHandle = true;

            // Create a pipe for the child process's STDIN.
            rs = CreatePipe(ffmpegStdinPtr, ffmpegInputPtr, sAttr.getPtr(), 0);
            if (!rs.value)
               throw Error('Failed to create STDIN pipe, error code: ' + getLastError(rs));

            // this must be set, so the write handle is not leaked into the child process
            // otherwise you will get a deadlock on WaitForSingleObject
            rs = SetHandleInformation(ffmpegInputPtr.readU32(), HANDLE_FLAG_INHERIT, 0);
            if (!rs.value)
               console.log('SetHandleInformation failed, error code: ' + getLastError(rs));

            // config for CreateProcess, redirecting stdin
            const startInfo = createCStruct(STARTUPINFO);
            startInfo.cb = startInfo.getSize();
            startInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE).value as number;
            startInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE).value as number;
            startInfo.hStdInput = ffmpegStdinPtr.readU32();
            startInfo.dwFlags |= STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;

            // Launch the ffmpeg process.
            rs = CreateProcess(NULL, ffmpegCmd, NULL, NULL, 1, 0, NULL, NULL, startInfo.getPtr(), procInfo.getPtr());
            if (!rs.value)
               throw Error('Failed to create a ffmpeg process, error code: ' + getLastError(rs));

            // we don't need this
            rs = CloseHandle(procInfo.hThread);
            if (!rs.value)
               console.log('CloseHandle failed (4), error code: ' + getLastError(rs));
            procInfo.hThread = 0;

            // ffmpeg now holds the one for input reading (a handle that is cloned from our),
            // so we don't need this anymore 
            rs = CloseHandle(ffmpegStdinPtr.readU32());
            if (!rs.value)
               console.log('CloseHandle failed (5), error code: ' + getLastError(rs));

            ffmpegStdinPtr.writeU32(0);

            console.log('ffmpeg opened.');
         } catch (err) {
            console.error(err.stack);
            recordingFailed = true;
            console.error('Failed to record.');
         }
      }
      // we are recording
      else if (recording && !recordingFailed) {
         try {
            // extract each frame into ffmpeg
            // read from video memory
            rs = BitBlt(memDcHdc, 0, 0, width, height, g_hdc.readU32(), 0, 0, SRCCOPY);
            if (!rs.value)
               throw Error('BitBlt failed, error code: ' + getLastError(rs));

            // draw the frame ordinal onto the captured frame
            const frameCountStr = (frameCount++).toString();
            TextOut(memDcHdc, 0, 0, str(frameCountStr), frameCountStr.length);

            // pass this frame to ffmpeg, here we don't care about stride because this game uses 640x480 (no stride)
            rs = WriteFile(ffmpegInputPtr.readU32(), ppvBits.readPointer(), width * 3 * height, dwWritten, NULL);
            if (!rs.value)
               throw Error('WriteFile failed, error code: ' + getLastError(rs));
         } catch (err) {
            console.error(err.stack);
            recordingFailed = true;
            console.error('Failed to record.');
         }
      }
   }, 'void', [], 'mscdecl');

   // we can get full frame at this function
   const UpdateFunc = {
      Addr: ptr(0x0040E250),
      ArgTypes: ['int32'],
      RetType: 'void',
      Abi: 'mscdecl' as NativeABI,
   };
   const OriUpdate = new NativeFunction(UpdateFunc.Addr, UpdateFunc.RetType, UpdateFunc.ArgTypes, UpdateFunc.Abi);
   // sometime NativeCallback crash the program (possibly corrupted stack or clobbered registers)
   // in that case, CModule is the best workaround
   Interceptor.replace(
      UpdateFunc.Addr,
      new NativeFunction(keep(new CModule(`
         extern void OriUpdate(int a1);
         extern void RecordFrame(void);
         void func(int a1) {
            OriUpdate(a1);
            RecordFrame();
         }
      `, { OriUpdate, RecordFrame }))[0].func, UpdateFunc.RetType, UpdateFunc.ArgTypes, UpdateFunc.Abi)
   );

   // register a callback when user presses R
   const KeyboardProc = wrapCdeclInStdcall(new NativeCallback((code: number, wParam: number, lParam: number) => {
      if (code === 0) {
         const keystrokeFlags = decodeKeystrokeFlags(lParam);
         if (wParam === VK_R && keystrokeFlags.transitionState === KEY_RELEASED) {
            recording = !recording;
            console.log('Recoding state: ' + (recording ? 'ON' : 'OFF'));
         }
      }
      return CallNextHookEx(0, code, wParam, lParam).value;
   }, LRESULT, ['int32', WPARAM, LPARAM], 'mscdecl'), 3);
   // run the register routine after the first form dialog to ensure that we do this on "UI Thread"
   Interceptor.replace(
      DialogBoxParamFunc.Addr,
      wrapCdeclInStdcall(new NativeCallback((hInstance, lpTemplateName, hWndParent, lpDialogFunc, dwInitParam) => {
         const rs = DialogBoxParam(hInstance, lpTemplateName, hWndParent, lpDialogFunc, dwInitParam).value;
         if (rs === 0)
            return rs;
         const threadId = Process.getCurrentThreadId();
         // some hook procedures are weird...
         // that they can only be used on "UI thread" (thread that already in a message loop) 
         const hookHandle = SetWindowsHookEx(WH_KEYBOARD, KeyboardProc, 0, threadId);
         if (hookHandle.value === 0)
            console.error('SetWindowsHookEx failed. Error code: ' + getLastError(hookHandle));
         else {
            console.log('SetWindowsHookEx successfully on thread ' + threadId);
            console.log('Press R key to toggle recording.');
         }
         return rs;
      }, DialogBoxParamFunc.RetType, DialogBoxParamFunc.ArgTypes, 'mscdecl'), DialogBoxParamFunc.ArgTypes.length)
   );
})();