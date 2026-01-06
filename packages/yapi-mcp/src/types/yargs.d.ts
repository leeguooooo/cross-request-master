declare module 'yargs' {
  const yargs: any;
  export default yargs;
}

declare module 'yargs/helpers' {
  export function hideBin(args: string[]): string[];
} 