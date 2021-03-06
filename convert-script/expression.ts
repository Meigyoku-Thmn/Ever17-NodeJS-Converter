import { addContext } from '../utils/error';
import { FlowOpcode, Opcode } from './opcode';
import { FLOW_OPCODE_ARGUMENT_MAP, OPCODE_ARGUMENT_MAP } from './read/argument-map';

export const enum ExpressionType {
   Operator, Const, Config, RGBA, VariableRef, VariableRef2, FunctionCall,
}

export const enum Operator {
   Assign, AddAssign, Equal, NotEqual, LessThanOrEqual, GreaterThanOrEqual, LessThan, GreaterThan,
}

export class Expression {
   type: ExpressionType;
   value?: string | number | number[]; // for Const, Config, RGBA, mapImage, mapMusic
   target?: number; // for mapOffset
   operator?: Operator; // for Operator
   name?: string; // for mapArgument, FunctionCall
   args?: Expression[];

   constructor(initialObj: Partial<Expression>) {
      return Object.assign(this, initialObj);
   }

   mapImage(images: string[], exprName?: string): Expression {
      try {
         if (this.type !== ExpressionType.Const)
            throw Error('Only number expression can be used as an ordinal number.');
         if (typeof (this.value) !== 'number')
            throw Error('Only number expression can be used as an ordinal number.');

         this.value = images[this.value];
         if (this.value == null)
            throw Error('Ordinal number is out-of-range.');

         return this;
      } catch (err) {
         if (exprName)
            addContext(err, ` at exprName '${exprName}'`);
         throw err;
      }
   }

   mapMusic(exprName?: string): Expression {
      try {
         if (this.type !== ExpressionType.Const)
            throw Error('Only number expression can be used as an ordinal number.');
         if (typeof (this.value) !== 'number')
            throw Error('Only number expression can be used as an ordinal number.');

         this.value = `bgm${this.value.toString().padStart(2, '0')}`;

         return this;
      } catch (err) {
         if (exprName)
            addContext(err, ` at exprName '${exprName}'`);
         throw err;
      }
   }

   mapOffset(labels: number[], exprName?: string): Expression {
      try {
         if (this.type !== ExpressionType.Const)
            throw Error('Only number expression can be used as an ordinal number.');
         if (typeof (this.value) !== 'number')
            throw Error('Only number expression can be used as an ordinal number.');

         this.target = labels[this.value];
         if (this.target == null)
            throw Error('Ordinal number is out-of-range.');

         return this;
      } catch (err) {
         if (exprName)
            addContext(err, ` at exprName '${exprName}'`);
         throw err;
      }
   }

   mapArgument(opcode: Opcode, ordinal: number): Expression {
      if (this.type !== ExpressionType.Const)
         return;

      this.name = OPCODE_ARGUMENT_MAP[opcode]?.[ordinal]?.[this.value.toString()] ?? this.name;

      return this;
   }

   mapFlowArgument(opcode: FlowOpcode, ordinal: number): Expression {
      if (this.type !== ExpressionType.Const)
         return this;

      this.name = FLOW_OPCODE_ARGUMENT_MAP[opcode]?.[ordinal]?.[this.value.toString()] ?? this.name;

      return this;
   }
}