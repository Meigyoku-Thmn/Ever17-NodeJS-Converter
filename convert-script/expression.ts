import { BufferTraverser } from '../utils/buffer-wrapper';

export function numberExpr(value: number): Expression {
   return {
      type: ExpressionType.Number,
      value: value,
   };
}

export enum ExpressionType {
   Operator, Const, Config, RGB, Variable, FunctionCall, Number
}

export enum Operator {
   Assign, Addssign, Equal, NotEqual, LessThanOrEqual, GreaterThanOrEqual, LessThan, GreaterThan
}

export type Expression = {
   type: ExpressionType;
   value?: number | number[];
   operator?: Operator;
   name?: string;
   funcArgs?: Expression[];
}

export function readExpression(reader: BufferTraverser): Expression {
   const mode = reader.readByte();
   if (mode >= 0xc0 && mode <= 0xcf) {
      const config = [mode - 0xc0, reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte()];
      return {
         type: ExpressionType.Config,
         value: config,
      };
   }
   if (mode >= 0xa0 && mode <= 0xaf) {
      const a = reader.readByte();
      return {
         type: ExpressionType.Const,
         value: 256 * (mode - 0xA0) + a,
      };
   }
   if (mode >= 0xb0 && mode <= 0xbf) {
      const a = reader.readByte();
      return {
         type: ExpressionType.Const,
         value: 256 * (mode - 0xBF) + (a - 0x100),
      };
   }
   if (mode >= 0x80 && mode <= 0x8f) {
      const a = mode - 0x80;
      return {
         type: ExpressionType.Const,
         value: a,
      };
   }
   if (mode === 0xe0) {
      const r = reader.readByte();
      const g = reader.readByte();
      const b = reader.readByte();
      return {
         type: ExpressionType.RGB,
         value: [r, g, b],
      };
   }

   switch (mode) {
      case 0x14: return { type: ExpressionType.Operator, operator: Operator.Assign };
      case 0x17: return { type: ExpressionType.Operator, operator: Operator.Addssign };
      case 0x0c: return { type: ExpressionType.Operator, operator: Operator.Equal };
      case 0x0d: return { type: ExpressionType.Operator, operator: Operator.NotEqual };
      case 0x0e: return { type: ExpressionType.Operator, operator: Operator.LessThanOrEqual };
      case 0x0f: return { type: ExpressionType.Operator, operator: Operator.GreaterThanOrEqual };
      case 0x10: return { type: ExpressionType.Operator, operator: Operator.LessThan };
      case 0x11: return { type: ExpressionType.Operator, operator: Operator.GreaterThan };
   }

   const [a1, a2] = [mode, reader.readByte()];

   if (a1 === 0x28 && a2 === 0x0a) {
      const kind = reader.readByte();
      const name = reader.readByte();
      const marker = reader.readByte();
      if (marker !== 0x14)
         throw Error(`Expected 0x14 as variable expression ending marker, got 0x${marker.toString(16)}.'`);
      let fullName: string;
      if (kind === 0xa0)
         fullName = 'dim_';
      else if (kind === 0xa2)
         fullName = 'eff_';
      else if (kind === 0xa3)
         fullName = 'sys_';
      else if (kind === 0xa4) {
         if (name > 0 && name <= 0x1f)
            fullName = 'g_';
         else
            fullName = 'l_';
      } else {
         throw Error(`Invalid variable kind: 0x${kind.toString(16)}.`);
      }
      fullName += name.toString(16).padStart(2, '0');
      return {
         type: ExpressionType.Variable,
         name: fullName,
      };
   }
   if (a1 === 0x33 && a2 === 0x0a) {
      const args = [readExpression(reader)];
      const marker = reader.readByte();
      if (marker !== 0x14)
         throw Error(`Expected 0x14 as variable expression ending marker, got 0x${marker.toString(16)}.'`);
      return {
         type: ExpressionType.FunctionCall,
         name: 'random',
         funcArgs: args,
      };
   }

   throw Error('Expected a valid expression, but got an unknown value.');
}