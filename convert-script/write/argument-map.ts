import { FlowOpcode, Opcode } from '../../convert-script/opcode';

type PropValueOf<T> = T[keyof T];
type ArgumentValue = Record<number, string>;
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
         256: 'NO_GAME_SAVE',
      },
   },
   [FlowOpcode.TurnFlagOff]: {
      0: {
         256: 'NO_GAME_SAVE',
      },
   }
};

export const OPCODE_ARGUMENT_MAP: OpcodeArgumentMap = {
   [Opcode.RemoveFG3]: {
      0: {
         1: '1 0 0',
         2: '2 0 0',
         3: '1 2 0',
         4: '4 0 0',
         5: '1 4 0',
         6: '2 4 0',
         7: '1 2 4',
      },
      1: {
         0: 'STATIC',
         3: 'FADE_OUT',
      }
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
      0: {
         0: '1',
         1: '2',
         2: '4',
      },
      1: {
         8: 'TRANSPARENT',
         15: 'NORMAL',
         16: 'NORMAL',
         17: 'TORCH_ILLUMINATED',
      },
   },
};