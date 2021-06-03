export const enum ExpressionType {
   Operator, Const, Config, RGB, Variable, FunctionCall,
}

export const enum Operator {
   Assign, Addssign, Equal, NotEqual, LessThanOrEqual, GreaterThanOrEqual, LessThan, GreaterThan,
}

export class Expression {
   type: ExpressionType;
   exprName: string;
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
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);
      if (typeof (this.value) !== 'number')
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);

      this.value = images[this.value];
      if (this.value == null)
         throw Error(`Ordinal number is out-of-range, exprName '${this.exprName}'`);

      return this;
   }

   /** Resolve ordinal number into bgm file name.
    * 
    * Note: This method mutates the expression directly. */
   mapMusic(): Expression {
      if (this.type !== ExpressionType.Const)
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);
      if (typeof (this.value) !== 'number')
         throw Error(`Only number expression can be used as an ordinal number, exprName '${this.exprName}'.`);

      this.value = `bgm${this.value.toString(16).padStart(2, '0')}`;

      return this;
   }
}