// Web app TV — aggiornamenti automatici non applicabili
export const checkForUpdate = async (): Promise<{
  hasUpdate: boolean;
  version?: string;
  downloadUrl?: string;
  notes?: string;
}> => {
  return { hasUpdate: false };
};
 
