export const enum MetaOpcode {
   Flow = 0x00,
   Command = 0x10,
   Text = 0xff,
   Variable = 0xfe,
}

const _MetaOpcode = eval('MetaOpcode');
export function MetaOpcodeName(value: MetaOpcode): string {
   return _MetaOpcode[value];
}

export const enum FlowOpcode {
   // Mark the end of main instruction section
   End = 0x00,
   Delay = 0x05,
   Suspend = 0x06,
   Goto = 0x07,
   GotoIf = 0x0a,
   Call = 0x0d,
   TurnFlagOn = 0x12,
   TurnFlagOff = 0x13,
   GotoIfFlag = 0x15, // relate to video, possibly part of a polling loop that check for video playback completion
   TurnMode = 0x19, // relate to video, possibly preparation and cleanup code
   Switch = 0x26, // this is actually 0x26 (switch) and 0x27 (goto if case)
   TurnFlag25On = 0x28,
}

const _FlowOpcode = eval('FlowOpcode');
export function FlowOpcodeName(value: FlowOpcode): string {
   return _FlowOpcode[value];
}

export const enum Opcode {
   ToFile = 0x01,
   PlayBGM = 0x03,
   StopBGM = 0x04,
   PlaySFX = 0x05,
   StopSFX = 0x06,
   WaitSFX = 0x07,
   PlayVoice = 0x08,
   WaitVoice = 0x09,
   LoadBG = 0x0c,
   RemoveBG = 0x0d,
   LoadFG = 0x0f,
   RemoveFG = 0x10,
   LoadFG2 = 0x12,
   RemoveFG3 = 0x13,
   SetFGOrder = 0x14,
   AffectFG = 0x15,
   LoadFG3 = 0x16,
   HideDialog = 0x18,
   ShowDialog = 0x19,
   MarkChoiceId = 0x1a,
   ShowChapter = 0x1d,
   Delay = 0x1e,
   ShowClock = 0x1f,
   StartAnim = 0x20,
   CloseAnim = 0x21,
   MarkLocationId = 0x24,
   LoadBGKeepFG = 0x27,
   Unk2B = 0x2b,
   UnlockImage = 0x37,
   OpenMovie = 0x39,
   StopMovie = 0x3A,
   SetMovieRect = 0x3B,
   PlayMovie = 0x3C,
   LoadBGCrop = 0x40,
   TweenZoom = 0x41,
   SetVolume = 0x43,
   OverlayMono = 0x45,
   SetDialogColor = 0x46,
}

const _Opcode = eval('Opcode');
export function OpcodeName(value: Opcode): string {
   return _Opcode[value];
}

export const enum TextualOpcode {
   // Mark the end of textual segment, return to main routine
   End = 0x00,
   // Yeah, you have to place the new line opcode manually, or the game will eventually crash
   NewLine = 0x01,
   Wait = 0x02,
   // Clear text, reset text state
   Clear = 0x03,
   // Thread sleep by nFrame
   Sleep = 0x04,
   // This is related to back log system, which I don't care about.
   MarkLog = 0x05,
   Choice = 0x0b,
   WaitVoice = 0x0c,
   Voice = 0x0d,
   // Mark the last point that you can save
   Mark = 0x0e,
   // Turn on/off some text states, but has no visual effect, may be the devs had some ideas but couldn't make it?
   // What if {State 0} is bold/italic/colored, or another font, and {State 1} revert to normal?
   // I checked the assembly code and there is no handling routine for this, it just continues the game loop and nothing else
   // Think about it, a lot of text segments in game script have this, and all of them are important plot points. It makes more sense if they are visually emphasized somehow.
   Style = 0x10,
   // Switch to big character state (param is always 0x03)
   Big = 0x11,
}

const _TextualOpcode = eval('TextualOpcode');
export function isTextualOpcode(byteCode: number): boolean {
   return byteCode !== TextualOpcode.NewLine && _TextualOpcode[byteCode] != null;
}
export function TextualOpcodeName(value: TextualOpcode): string {
   return _TextualOpcode[value];
}