require("dotenv").config({ path: "/Users/archie/projects/mdp-tracker/.env.local" });
const BASE_URL = "https://gateway.prod.bill.com/connect";
const API_TOKEN=*** check() {
  const res = await fetch(BASE_URL + "/v3/spend/transactions?cursor=&pageSize=1000", {
    headers: { "Authorization": "Bearer " + API_TOKEN, "Accept": "application/json" }
  });
  console.log("HTTP status:", res.status);
  const body = await res.json();
  console.log("Top-level keys:", Object.keys(body));
  console.log("Raw body:", JSON.stringify(body).slice(0, 800));
}
check().catch(console.error);
