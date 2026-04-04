/** Extracts the alert title from an OCSF Detection Finding object. */
export const extractAlertTitle = (ocsf: Record<string, unknown>): string => {
  const fi = ocsf?.finding_info as Record<string, unknown> | undefined
  return (fi?.title as string) || 'Unknown alert'
}
