import fs, { Stats } from 'fs';
import { getAllFilePaths } from 'cup-readdir';

export function nameof(obj: unknown): string {
   return Object.keys(obj)[0];
}

export async function getNewestStats(dirPath: string, ext: string): Promise<Stats> {
   const paths = await getAllFilePaths(dirPath) as string[];
   return paths
      .filter(path => path.endsWith(ext))
      .reduce((newestStats, path) => {
         const stats = fs.statSync(path);
         if (stats.mtimeMs > newestStats.mtimeMs)
            newestStats = stats;
         return newestStats;
      }, { mtimeMs: -1 } as Stats);
}
