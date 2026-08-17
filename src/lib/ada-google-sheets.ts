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
  const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: input.title } } });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Google Sheets did not return a spreadsheet ID.");
  await drive.files.update({ fileId: spreadsheetId, addParents: folderId, fields: "id,webViewLink", supportsAllDrives: true });
  await sheets.spreadsheets.values.update({ spreadsheetId, range: "Sheet1!A1", valueInputOption: "USER_ENTERED", requestBody: { values: input.values } });
  // Private by default: no permissions are added. The shared Drive folder controls deliberate team visibility.
  return { spreadsheetId, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
}
