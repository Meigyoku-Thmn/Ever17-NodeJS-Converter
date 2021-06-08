import { Opcode } from './opcode';
import { ARGUMENT_MAP } from './write/argument-map';

export const enum ExpressionType {
   Operator, Const, Config, RGB, Variable, FunctionCall,
}

export const enum Operator {
   Assign, AddAssign, Equal, NotEqual, LessThanOrEqual, GreaterThanOrEqual, LessThan, GreaterThan,
}

export class Expression {
   type: ExpressionType;
   exprName: string;
   value?: string | number | number[];
   target?: number;
   operator?: Operator;
   name?: string;
   funcArgs?: Expression[];

   constructor(initialObj: Partial<Expression>) {
      return Object.assign(this, initialObj);
   }

   mapImage(images: string[]): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);
      if (typeof (this.value) !== 'number')
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);

      this.value = images[this.value];
      if (this.value == null)
         throw Error(`Ordinal number is out-of-range, exprName '${this.exprName}'`);

      return this;
   }

   mapMusic(): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);
      if (typeof (this.value) !== 'number')
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);

      this.value = `bgm${this.value.toString().padStart(2, '0')}`;

      return this;
   }

   mapOffset(labels: number[]): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);
      if (typeof (this.value) !== 'number')
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);

      this.target = labels[this.value];
      if (this.target == null)
         throw Error(`Ordinal number is out-of-range, exprName '${this.exprName}'`);

      return this;
   }

   mapArgument(opcode: Opcode, ordinal: number): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error(`Only number expression can be used to map argument, exprName '${this.exprName}'.`);
      if (typeof (this.value) !== 'number')
         throw Error(`Only number expression can be used to map argument, exprName '${this.exprName}'.`);
      this.name = ARGUMENT_MAP[opcode]?.[ordinal]?.[this.value] ?? this.name;
      return this;
   }
}