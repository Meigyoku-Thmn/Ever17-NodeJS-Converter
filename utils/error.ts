export function addContext(err: { contexts: string[]; }, message: string): void {
   if (!Array.isArray(err.contexts))
      err.contexts = [];
   err.contexts.push(message);
}

export function printError(err: { contexts: string[]; }): void {
   if (Array.isArray(err.contexts))
      for (let i = err.contexts.length - 1; i >= 0; i--)
         console.error(err.contexts[i]);
   delete err.contexts;
   console.error(err);
}