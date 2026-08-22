// Small shared helpers and the `%c` console style strings used across the CLI.

export const successStyle = "color: green";
export const infoStyle = "color: blue";
export const warnStyle = "color: yellow";
export const errorStyle = "color: red";

/** Human-readable "N minutes and M seconds" between two dates. */
export function getTimeDifference(startTime: Date, endTime: Date): string {
  const timeDiff = endTime.getTime() - startTime.getTime();
  const secondsDiff = Math.floor(timeDiff / 1000) % 60;
  const minutesDiff = Math.floor(timeDiff / (1000 * 60));
  return `${minutesDiff} minutes and ${secondsDiff} seconds`;
}
