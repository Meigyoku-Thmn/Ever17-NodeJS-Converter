import { makeHexPad2 } from '../../utils/string';
import { BufferTraverser } from '../../utils/buffer-wrapper';
import { addContext } from '../../utils/error';
import { Expression, ExpressionType, Operator } from '../../convert-script/expression';
import { VARIABLE_MAP } from './variable_map';

export function createRawExpr(value: number | string | number[]): Expression {
   return new Expression({ type: ExpressionType.Const, value });
}

export function readCStringExpr(reader: BufferTraverser, exprName?: string): Expression {
   try {
      return createRawExpr(reader.readCASCII());
   } catch (err) {
      if (exprName)
         addContext(err, ` at exprName '${exprName}'`);
      throw err;
   }
}

export function readRawInt16Expr(reader: BufferTraverser, exprName?: string): Expression {
   try {
      return createRawExpr(reader.readUInt16());
   } catch (err) {
      if (exprName)
         addContext(err, ` at exprName '${exprName}'`);
      throw err;
   }
}

export function readRawByteExpr(reader: BufferTraverser, exprName?: string): Expression {
   try {
      return createRawExpr(reader.readByte());
   } catch (err) {
      if (exprName)
         addContext(err, ` at exprName '${exprName}'`);
      throw err;
   }
}

export function readExpressions(reader: BufferTraverser, exprName: string): Expression[] {
   try {
      let endReached = false;
      const resultExpressions: Expression[] = [];
      let mode = reader.readByte();
      do {
         let rs: Expression;

         from_get_expression_routine:
         do {
            if (mode >= 0xc0 && mode <= 0xcf) {
               const config = [mode - 0xc0, reader.readByte(), reader.readByte()];
               rs = new Expression({
                  type: ExpressionType.Config,
                  value: config,
               });
               break from_get_expression_routine;
            }
            if (mode >= 0xa0 && mode <= 0xaf) {
               const mostByte = mode - 0xA0;
               const leastByte = reader.readByte();
               rs = new Expression({
                  type: ExpressionType.Const,
                  value: (mostByte << 8) + leastByte,
               });
               break from_get_expression_routine;
            }
            if (mode >= 0xb0 && mode <= 0xbf) {
               const mostByte = mode - 0xb0;
               const leastByte = reader.readByte();
               rs = new Expression({
                  type: ExpressionType.Const,
                  value: ((mostByte << 8) + leastByte) | 0xFFFFF000,
               });
               break from_get_expression_routine;
            }
            if (mode >= 0x80 && mode <= 0x8f) {
               const value = mode - 0x80;
               rs = new Expression({
                  type: ExpressionType.Const,
                  value: value,
               });
               break from_get_expression_routine;
            }
            if (mode === 0xe0) {
               const r = reader.readByte();
               const g = reader.readByte();
               const b = reader.readByte();
               const a = reader.readByte(); // this byte is always zero or unused
               rs = new Expression({
                  type: ExpressionType.RGBA,
                  value: [r, g, b, a],
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
            reader.pos--;

            if (a1 === 0x28 && a2 === 0x0a) {
               rs = new Expression({
                  type: ExpressionType.VariableRef,
               });
               break from_get_expression_routine;
            }
            if (a1 === 0x2d && a2 === 0x0a) {
               rs = new Expression({
                  type: ExpressionType.VariableRef2,
               });
               break from_get_expression_routine;
            }
            if (a1 === 0x33 && a2 === 0x0a) {
               rs = new Expression({
                  type: ExpressionType.FunctionCall,
                  name: 'random',
               });
               break from_get_expression_routine;
            }
            // eslint-disable-next-line no-constant-condition
         } while (false);

         if (rs == null)
            throw Error(`Expected a valid expression, but got an unknown value: ${mode}.`);
         resultExpressions.push(rs);

         reader.readByte(); // skip trash value

         if ((mode = reader.readByte()) === 0)
            endReached = true;

      } while (endReached === false);

      for (let i = 0; i < resultExpressions.length; i++) {
         const expr = resultExpressions[i];
         if (expr.type === ExpressionType.FunctionCall) {
            expr.args = resultExpressions.splice(i + 1, 1);
            if (expr.args[0].type !== ExpressionType.Const)
               throw Error(
                  `Expected a const expression after random function call, get type 0x${makeHexPad2(expr.args[0].type)}.`);
         }
         else if (expr.type === ExpressionType.VariableRef) {
            const varExpr = resultExpressions.splice(i + 1, 1)[0];
            if (varExpr.type !== ExpressionType.Const)
               throw Error(
                  `Expected a const expression after random function call, get type 0x${makeHexPad2(varExpr.type)}.`);
            const kind = <number>varExpr.value >>> 8;
            const name = <number>varExpr.value & 0xFF;
            if (kind === 0x0)
               expr.name = 'dim_';
            else if (kind === 0x2)
               expr.name = 'eff_';
            else if (kind === 0x3)
               expr.name = 'sys_';
            else if (kind === 0x4) {
               if (name > 0 && name <= 0x1f)
                  expr.name = 'g_';
               else
                  expr.name = 'l_';
            } else {
               throw Error(`Invalid variable kind: 0x${kind.toString(16)}.`);
            }
            expr.name += makeHexPad2(name);
            expr.name = VARIABLE_MAP[expr.name] ?? expr.name;
         }
         else if (expr.type === ExpressionType.VariableRef2) {
            const varExpr = resultExpressions.splice(i + 1, 1)[0];
            if (varExpr.type !== ExpressionType.Const)
               throw Error(
                  `Expected a const expression after random function call, get type 0x${makeHexPad2(varExpr.type)}.`);
            expr.name = `m_${makeHexPad2(varExpr.value as number)}`;
            expr.name = VARIABLE_MAP[expr.name] ?? expr.name;
         }
      }

      return resultExpressions;

   } catch (err) {
      addContext(err, ` for expression name '${exprName}'`);
      throw err;
   }
}