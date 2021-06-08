export function makeHexPad16(value: number): string {
   if (typeof (value) !== 'number')
      throw Error('Expected a number.');
   return value.toString(16).padStart(8, '0');
}

export function makeHexPad2(value: number): string {
   if (typeof (value) !== 'number')
      throw Error('Expected a number.');
   return value.toString(16).padStart(2, '0');
}