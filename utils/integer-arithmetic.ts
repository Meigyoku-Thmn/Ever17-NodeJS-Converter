const IntMask = 0xFFFFFFFF;
const ByteMask = 0xFF;

function add(a: number, b: number, mask: number) {
   return ((a & mask) + (b & mask)) & mask;
}

function sub(a: number, b: number, mask: number) {
   return add(a, -b, mask);
}

function mul(a: number, b: number, mask: number) {
   return Math.imul(a, b) & mask;
}

function div(a: number, b: number, mask: number) {
   a = +a; b = +b;
   if (!Number.isFinite(a)) throw Error('Expected finite number, got a =' + a);
   if (!Number.isFinite(b)) throw Error('Expected finite number, got b =' + b);
   if (b === 0) throw Error('Division by zero.');
   return ((a & mask) / (b & mask)) & mask;
}

/// Byte arithmetic
export function badd(a: number, b: number): number {
   return add(a, b, ByteMask);
}

export function bsub(a: number, b: number): number {
   return sub(a, b, ByteMask);
}

export function bmul(a: number, b: number): number {
   return mul(a, b, ByteMask);
}

export function bdiv(a: number, b: number): number {
   return div(a, b, ByteMask);
}

/// Int arithmetic
export function iadd(a: number, b: number): number {
   return add(a, b, IntMask);
}

export function isub(a: number, b: number): number {
   return sub(a, b, IntMask);
}

export function imul(a: number, b: number): number {
   return mul(a, b, IntMask);
}

export function idiv(a: number, b: number): number {
   return div(a, b, IntMask);
}