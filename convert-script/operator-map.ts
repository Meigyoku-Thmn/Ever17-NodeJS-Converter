import { Operator } from './expression';

export const OPERATOR_MAP = {
   [Operator.Assign]: ':=',
   [Operator.AddAssign]: '+=',
   [Operator.Equal]: '=',
   [Operator.NotEqual]: '!=',
   [Operator.LessThanOrEqual]: '<=',
   [Operator.GreaterThanOrEqual]: '>=',
   [Operator.LessThan]: '<',
   [Operator.GreaterThan]: '>',
};