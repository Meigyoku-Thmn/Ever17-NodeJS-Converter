import { BufferTraverser } from '../../utils/buffer-wrapper';
import { addContext } from '../../utils/error';
import { Expression, ExpressionType, Operator } from '../expression';
import { skipPadding } from './skip-padding';

function createRawExpr(value: number | string): Expression {
   return new Expression({ type: ExpressionType.Const, value });
}

export function readCStringExpr(reader: BufferTraverser, exprName: string): Expression {
   try {
      return createRawExpr(reader.readCASCII());
   } catch (err) {
      addContext(err, ` at exprName '${exprName}'`);
      throw err;
   }
}

export function readRawInt16Expr(reader: BufferTraverser, exprName: string): Expression {
   try {
      return createRawExpr(reader.readUInt16());
   } catch (err) {
      addContext(err, ` at exprName '${exprName}'`);
      throw err;
   }
}

export function readRawByteExpr(reader: BufferTraverser, exprName: string): Expression {
   try {
      return createRawExpr(reader.readByte());
   } catch (err) {
      addContext(err, ` at exprName '${exprName}'`);
      throw err;
   }
}


export function readExpression(reader: BufferTraverser,
   exprName: string, hasPadding = false, paddingSize: 1 | 2 = 2): Expression {
   try {
      const mode = reader.readByte();
      let rs: Expression;

      from_get_expression_routine:
      do {
         if (mode >= 0xc0 && mode <= 0xcf) {
            const config = [mode - 0xc0, reader.readByte(), reader.readByte(), reader.readByte(), reader.readByte()];
            rs = new Expression({
               type: ExpressionType.Config,
               value: config,
            });
            hasPadding = false; // mode CX never have padding as far as I know
            break from_get_expression_routine;
         }
         if (mode >= 0xa0 && mode <= 0xaf) {
            const a = reader.readByte();
            rs = new Expression({
               type: ExpressionType.Const,
               value: 256 * (mode - 0xA0) + a,
            });
            break from_get_expression_routine;
         }
         if (mode >= 0xb0 && mode <= 0xbf) {
            const a = reader.readByte();
            rs = new Expression({
               type: ExpressionType.Const,
               value: 256 * (mode - 0xBF) + (a - 0x100),
            });
            break from_get_expression_routine;
         }
         if (mode >= 0x80 && mode <= 0x8f) {
            const a = mode - 0x80;
            rs = new Expression({
               type: ExpressionType.Const,
               value: a,
            });
            break from_get_expression_routine;
         }
         if (mode === 0xe0) {
            const r = reader.readByte();
            const g = reader.readByte();
            const b = reader.readByte();
            rs = new Expression({
               type: ExpressionType.RGB,
               value: [r, g, b],
            });
            break from_get_expression_routine;
         }

         switch (mode) {
            case 0x14:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.Assign });
               break from_get_expression_routine;
            case 0x17:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.AddAssign });
               break from_get_expression_routine;
            case 0x0c:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.Equal });
               break from_get_expression_routine;
            case 0x0d:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.NotEqual });
               break from_get_expression_routine;
            case 0x0e:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.LessThanOrEqual });
               break from_get_expression_routine;
            case 0x0f:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.GreaterThanOrEqual });
               break from_get_expression_routine;
            case 0x10:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.LessThan });
               break from_get_expression_routine;
            case 0x11:
               rs = new Expression({ type: ExpressionType.Operator, operator: Operator.GreaterThan });
               break from_get_expression_routine;
         }

         const [a1, a2] = [mode, reader.readByte()];

         if (a1 === 0x28 && a2 === 0x0a) {
            const kind = reader.readByte();
            const name = reader.readByte();
            const marker = reader.readByte();
            if (marker !== 0x14)
               throw Error(
                  `Expected 0x14 as variable expression ending marker, got 0x${marker.toString(16)}.'`);
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
            break from_get_expression_routine;
         }
         if (a1 === 0x33 && a2 === 0x0a) {
            let arg: Expression;
            try {
               arg = readExpression(reader, 'maxValue');
            } catch (err) {
               addContext(err, ' at function random');
               throw err;
            }
            const marker = reader.readByte();
            if (marker !== 0x14)
               throw Error(
                  `Expected 0x14 as variable expression ending marker, got 0x${marker.toString(16)}.'`);
            rs = new Expression({
               type: ExpressionType.FunctionCall,
               name: 'random',
               funcArgs: [arg],
            });
            break from_get_expression_routine;
         }
         // eslint-disable-next-line no-constant-condition
      } while (false);

      if (rs == null)
         throw Error(`Expected a valid expression, but got an unknown value: ${mode}.`);

      if (hasPadding === true)
         skipPadding(reader, paddingSize);

      rs.exprName = exprName;
      return rs;
   } catch (err) {
      addContext(err, ` for expression name '${exprName}'`);
      throw err;
   }
}