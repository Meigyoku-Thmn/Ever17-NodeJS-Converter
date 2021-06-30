import { FlowOpcode, Opcode } from '../opcode';

type PropValueOf<T> = T[keyof T];
type ArgumentValue = Record<number | string, string>;
type ArgumentConfig = Record<number, ArgumentValue>;
type OpcodeStatementName = PropValueOf<typeof Opcode>;
type OpcodeArgumentMap = Partial<Record<OpcodeStatementName, ArgumentConfig>>;
type FlowOpcodeStatementName = PropValueOf<typeof FlowOpcode>;
type FlowOpcodeArgumentMap = Partial<Record<FlowOpcodeStatementName, ArgumentConfig>>;

export const FLOW_OPCODE_ARGUMENT_MAP: FlowOpcodeArgumentMap = {
   [FlowOpcode.Call]: {
      0: {
         332: 'SHAKE_FD_1',
         336: 'SHAKE_FD_2',
         338: 'SHAKE_FD_4',
         346: 'SHAKE_HARD_FD_1',
      },
   },
   [FlowOpcode.TurnMode]: {
      1: {
         3: 'OFF',
         4: 'ON',
      },
   },
   [FlowOpcode.TurnFlagOn]: {
      0: {
         256: 'CANNOT_SAVE_GAME',
      },
   },
   [FlowOpcode.TurnFlagOff]: {
      0: {
         256: 'CANNOT_SAVE_GAME',
      },
   },
   [FlowOpcode.GotoIfFlag]: {
      0: {
         0: 'FALSE',
         1: 'TRUE',
      },
      1: {
         '32,1': 'MOVIE_SKIPPED',
      },
   }
};

export const OPCODE_ARGUMENT_MAP: OpcodeArgumentMap = {
   [Opcode.SetMovieRect]: {
      0: {
         0: 'MIRROR',
         1: 'NORMAL',
      },
   },
   [Opcode.RemoveBG]: {
      0: {
         0: 'BLACK_IMAGE',
         1: 'WHITE_IMAGE',
      },
   },
   [Opcode.LoadFG]: {
      0: {
         1: '0',
         2: '1',
         4: '2',
      },
      3: {
         0: 'STATIC',
         3: 'FADE_IN',
      },
   },
   [Opcode.RemoveFG]: {
      0: {
         1: '0',
         2: '1',
         4: '2',
      },
      1: {
         0: 'STATIC',
         3: 'FADE_OUT',
      },
   },
   [Opcode.LoadFG2]: {
      0: {
         1: '0',
         2: '1',
         4: '2',
      },
      1: {
         1: '0',
         2: '1',
         4: '2',
      },
      6: {
         0: 'STATIC',
         3: 'FADE_IN',
      },
   },
   [Opcode.LoadFG3]: {
      6: {
         0: 'STATIC',
         3: 'FADE_IN',
      },
   },
   [Opcode.RemoveFG3]: {
      0: {
         0b0_0001: '(0)',
         0b0_0010: '(1)',
         0b0_0011: '(0,1)',
         0b0_0100: '(2)',
         0b0_0101: '(0,2)',
         0b0_0110: '(1,2)',
         0b0_0111: '(0,1,2)',
      },
      1: {
         0: 'STATIC',
         3: 'FADE_OUT',
      },
   },
   [Opcode.StartAnim]: {
      0: {
         4: 'SCREEN_SHAKE_HARD',
         5: 'SCREEN_SHAKE',
         12: 'SCREEN_SHAKE_ANIM',
         19: 'FOG_2',
         27: 'GOD_RAY_ANIM',
         32: 'FILTER_2',
         41: 'SNOW_FALL_ANIM',
         44: 'DIM_OVERLAY',
         45: 'DIM_IN_AND_OUT',
         46: 'FLASH',
         47: 'CHANGE_PERSPECTIVE',
         48: 'MAP_COMMENT_ANIM',
         49: 'MAP_ROOT_IMAGE_BLINK_ANIM',
         18: 'CHERRY_BLOSSOM_FALL_ANIM',
      },
   },
   [Opcode.CloseAnim]: {
      0: {
         0: 'FOG_2',
         7: 'GOD_RAY_ANIM',
         11: 'SCREEN_SHAKE_ANIM',
         12: 'CHERRY_BLOSSOM_FALL_ANIM',
         13: 'DIM_IN_AND_OUT_OR_FILTER_ANIM',
         14: 'SNOW_FALL_ANIM',
         15: 'MAP_INDICATE_ANIM',
         16: 'DIM_OVERLAY',
      },
   },
   [Opcode.SetDialogColor]: {
      0: {
         0: 'BLUE',
         1: 'GREEN',
         2: 'GRAY',
      },
   },
   [Opcode.AffectFG]: {
      1: {
         8: 'TRANSPARENT',
         15: 'NORMAL',
         16: 'NORMAL',
         17: 'TORCH_ILLUMINATED',
      },
   },
   [Opcode.OverlayMono]: {
      1: {
         0: 'BLACK',
         1: 'WHITE',
      },
   },
};