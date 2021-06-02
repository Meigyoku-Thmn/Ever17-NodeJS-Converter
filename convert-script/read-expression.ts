import { BufferTraverser } from '../utils/buffer-wrapper';
import { skipPadding } from './skip-padding';

export function createRawExpr(value: number | string): Expression {
   if (typeof (value) !== 'number' && typeof (value) !== 'string')
      throw Error(`Expected string or number as value type, got ${typeof (value)} type.`);
   return new Expression({ type: ExpressionType.Const, value });
}

export const enum ExpressionType {
   Operator, Const, Config, RGB, Variable, FunctionCall
}

export const enum Operator {
   Assign, Addssign, Equal, NotEqual, LessThanOrEqual, GreaterThanOrEqual, LessThan, GreaterThan
}

export class Expression {
   type: ExpressionType;
   value?: string | number | number[];
   operator?: Operator;
   name?: string;
   funcArgs?: Expression[];

   constructor(initialObj: Partial<Expression>) {
      return Object.assign(this, initialObj);
   }

   /** Resolve ordinal number into bgm file name.
    * 
    * Note: This method mutates the expression directly. */
   mapImage(images: string[]): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error('Only number expression can be used as an ordinal number.');
      if (typeof (this.value) !== 'number')
         throw Error('Only number expression can be used as an ordinal number.');

      this.value = images[this.value];
      if (this.value == null)
         throw Error('Ordinal number is out-of-range.');

      return this;
   }

   /** Resolve ordinal number into bgm file name.
    * 
    * Note: This method mutates the expression directly. */
   mapMusic(): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error('Only number expression can be used as an ordinal number.');
      if (typeof (this.value) !== 'number')
         throw Error('Only number expression can be used as an ordinal number.');

      this.value = `bgm${this.value.toString(16).padStart(2, '0')}`;

      return this;
   }
}

export function readExpression(reader: BufferTraverser, paddingMessage: string | (() => string) = null): Expression {
   const mode = reader.readByte();
   let rs: Expression;
   do {
      if (mode >= 0xc0 && mode <= 0xcf) {
         const config = [mode - 0xc0, reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte()];
         rs = new Expression({
            type: ExpressionType.Config,
            value: config,
         });
         break;
      }
      if (mode >= 0xa0 && mode <= 0xaf) {
         const a = reader.readByte();
         rs = new Expression({
            type: ExpressionType.Const,
            value: 256 * (mode - 0xA0) + a,
         });
         break;
      }
      if (mode >= 0xb0 && mode <= 0xbf) {
         const a = reader.readByte();
         rs = new Expression({
            type: ExpressionType.Const,
            value: 256 * (mode - 0xBF) + (a - 0x100),
         });
         break;
      }
      if (mode >= 0x80 && mode <= 0x8f) {
         const a = mode - 0x80;
         rs = new Expression({
            type: ExpressionType.Const,
            value: a,
         });
         break;
      }
      if (mode === 0xe0) {
         const r = reader.readByte();
         const g = reader.readByte();
         const b = reader.readByte();
         rs = new Expression({
            type: ExpressionType.RGB,
            value: [r, g, b],
         });
         break;
      }

      switch (mode) {
         case 0x14:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.Assign });
            break;
         case 0x17:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.Addssign });
            break;
         case 0x0c:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.Equal });
            break;
         case 0x0d:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.NotEqual });
            break;
         case 0x0e:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.LessThanOrEqual });
            break;
         case 0x0f:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.GreaterThanOrEqual });
            break;
         case 0x10:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.LessThan });
            break;
         case 0x11:
            rs = new Expression({ type: ExpressionType.Operator, operator: Operator.GreaterThan });
            break;
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
         rs = new Expression({
            type: ExpressionType.Variable,
            name: fullName,
         });
         break;
      }
      if (a1 === 0x33 && a2 === 0x0a) {
         const args = [readExpression(reader)];
         const marker = reader.readByte();
         if (marker !== 0x14)
            throw Error(`Expected 0x14 as variable expression ending marker, got 0x${marker.toString(16)}.'`);
         rs = new Expression({
            type: ExpressionType.FunctionCall,
            name: 'random',
            funcArgs: args,
         });
         break;
      }
      // eslint-disable-next-line no-constant-condition
   } while (false);

   if (rs == null)
      throw Error(`Expected a valid expression, but got an unknown value: ${mode}.`);

   if (paddingMessage != null)
      skipPadding(reader, 2, paddingMessage);

   return rs;
}