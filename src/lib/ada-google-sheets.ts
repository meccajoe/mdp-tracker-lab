import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/spreadsheets"];

type SheetInput = { title: string; values: Array<Array<string | number>> };

function serviceAccountCredentials() {
  const raw = process.env.ADA_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Ada Google Sheets is not configured: ADA_GOOGLE_SERVICE_ACCOUNT_JSON is required.");
  try { return JSON.parse(raw); } catch { throw new Error("Ada Google Sheets service-account JSON is invalid."); }
}

export async function createPrivateAdaGoogleSheet(input: SheetInput) {
  const folderId = process.env.ADA_GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("Ada Google Sheets is not configured: ADA_GOOGLE_DRIVE_FOLDER_ID is required.");
  const auth = new google.auth.GoogleAuth({ credentials: serviceAccountCredentials(), scopes: SCOPES });
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });
  const created = await drive.files.create({ requestBody: { name: input.title, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] }, fields: "id,webViewLink", supportsAllDrives: true });
  const spreadsheetId = created.data.id;
  if (!spreadsheetId) throw new Error("Google Drive did not return a spreadsheet ID.");
  await sheets.spreadsheets.values.update({ spreadsheetId, range: "Sheet1!A1", valueInputOption: "USER_ENTERED", requestBody: { values: input.values } });
  // Private by default: no permissions are added. The shared Drive folder controls deliberate team visibility.
  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
}

export async function applyAdaGoogleSheetRangeChange(input: { spreadsheetId: string; rangeA1: string; values: unknown[][] }) {
  const auth = new google.auth.GoogleAuth({ credentials: serviceAccountCredentials(), scopes: SCOPES });
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({ spreadsheetId: input.spreadsheetId, range: input.rangeA1, valueInputOption: "USER_ENTERED", requestBody: { values: input.values } });
}
