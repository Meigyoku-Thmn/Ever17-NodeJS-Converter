const keeper = [];
export function keep<T extends unknown[]>(...data: T): T {
   data.forEach(datum => keeper.push(datum));
   return data;
}

export function str(text: string): NativePointer {
   return Memory.allocUtf8String(text);
}

export function wstr(text: string): NativePointer {
   return Memory.allocUtf16String(text);
}

export function wrapCdeclInStdcall(func: NativeCallback, numArgs: number): NativePointer {
   if (Process.arch !== 'ia32' || Process.platform !== 'windows')
      throw new Error('This function can only work on Windows 32-bit!');
   if (numArgs > 127 || numArgs < 0)
      throw new Error('numArgs is out of range [0, 127]');
   const wrapperFunc = Memory.alloc(Process.pageSize);
   Memory.patchCode(wrapperFunc, Process.pageSize, code => {
      const cw = new X86Writer(code, { pc: wrapperFunc });
      for (let i = 0; i < numArgs; i++) {
         cw.putBytes(new Uint8Array([0xFF, 0x74, 0x24, 4 * numArgs]).buffer as ArrayBuffer);
      }                                    // push   DWORD PTR [esp + 4 * numArgs] -- push arguments for cdecl call
      cw.putCallAddress(func);             // call   func                          -- call the cdecl function
      cw.putAddRegImm('esp', 4 * numArgs); // add    esp, 4 * numArg               -- clear the pushed arguments
      cw.putRetImm(4 * numArgs);           // ret    4 * numArgs                   -- return and clear all arguments
      cw.flush();
   });
   keep(func);
   return wrapperFunc;
}

export function sendCommand(command: string, recordName?: string): { message: unknown, data: ArrayBuffer } {
   let message: unknown;
   let data: ArrayBuffer;
   send({ command: 'Get' + command, recordName });
   recv(command, (_payload, _data) => { message = _payload.message; data = _data; }).wait();
   return { message, data };
}

export function getScriptRecord(recordName: string): ArrayBuffer {
   return sendCommand('ScriptData', recordName).data;
}

export function getLastError(lastResult: SystemFunctionResult): number {
   if (Process.platform === 'windows')
      return (lastResult as WindowsSystemFunctionResult).lastError;
   return (lastResult as UnixSystemFunctionResult).errno;
}

interface KeystrokeData {
   repeatedCount: number;
   scanCode: number;
   isExtended: boolean;
   altPressed: boolean;
   previousState: number;
   transitionState: number;
}

export const KEY_HELD = 0;
export const KEY_RELEASED = 1;

export function decodeKeystrokeFlags(flags: number): KeystrokeData {
   return {
      repeatedCount: (flags >> 0) & 0xFFFF,
      scanCode: (flags >> 16) & 0xFF,
      isExtended: !!((flags >> 24) & 0x1),
      altPressed: !!((flags >> 29) & 0x1),
      previousState: (flags >> 30) & 0x1,
      transitionState: (flags >> 31) & 0x1,
   };
}