export enum OpcodeType {
   MetaOpcode, Opcode, TextualOpcode
}

export enum MetaOpcode {
   NoOp = 0x00,
   GotoIf = 0x0a,
   Switch = 0x26,
   CallText = 0xff,
   VarOp = 0xfe,
   Command = 0x10,
   Sleep = 0x05,
   MUnk28 = 0x28,
   MUnk19 = 0x19,
   MUnk12 = 0x12,
   MUnk13 = 0x13,
   MUnk06 = 0x06,
   MUnk0D = 0x0d,
   MUnk15 = 0x15,
}

export enum Opcode {
   ToFile = 0x01,
   PlayBGM = 0x03,
   StopBGM = 0x04,
   PlaySFX = 0x05,
   StopSFX = 0x06,
   WaitSFX = 0x07,
   PlayVoice = 0x08,
   Unk09 = 0x09,
   LoadBG = 0x0c,
   RemoveBG = 0x0d,
   LoadFG = 0x0f,
   RemoveFG = 0x10,
   LoadFG2 = 0x12,
   RemoveFG2 = 0x13,
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
   StopAnim = 0x21,
   MarkLocationId = 0x24,
   LoadBGKeepFG = 0x27,
   Unk2B = 0x2b,
   UnlockImage = 0x37,
   PlayMovie = 0x39,
   Unk3A = 0x3a,
   Unk3B = 0x3B,
   Unk3C = 0x3C,
   LoadBGCrop = 0x40,
   TweenZoom = 0x41,
   Unk43 = 0x43,
   OverlayMono = 0x45,
   SetDialogColor = 0x46,
}

export enum TextualOpcode {

}