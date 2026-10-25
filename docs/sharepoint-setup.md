# Connecting Rboreal to SharePoint

Rboreal can link records to documents in SharePoint, browse and search a document library, and keep its workbook in that library. A team then shares one system of record under SharePoint's permissions and version history. Until it's connected, the app runs a demo tenant (Contoso's Fund Legal site), with the same features against sample documents.

This guide is for the Microsoft 365 administrator who registers the app and for the person who sets it up. The code is [app/core/sharepoint.js](../app/core/sharepoint.js).

## 1. Register the app in Microsoft Entra ID

You need rights to register applications, and to grant admin consent for the last step.

1. In the [Entra admin center](https://entra.microsoft.com), go to **Identity › Applications › App registrations › New registration**.
2. **Name:** Rboreal. **Supported account types:** *Accounts in this organizational directory only*.
3. **Redirect URI:** choose the platform **Single-page application (SPA)**, then enter the exact address the app is served from. For example, `https://rboreal.contoso.com/chart.html`. During development you can use `http://localhost:8080/chart.html`.
   - The address must be `https://`, or `http://localhost`. Opening the page as a file (`file:///…`) can't sign in.
   - The platform must be SPA, not Web. Otherwise Entra ID refuses the browser's token request.
4. Register, then copy from **Overview**:
   - the **Application (client) ID**;
   - the **Directory (tenant) ID**.
5. Under **API permissions › Add a permission › Microsoft Graph › Delegated permissions**, add:

   | Permission | Why |
   | ---------- | --- |
   | `User.Read` | To show who's signed in |
   | `Files.Read.All` | To read the documents and folders the user can open |
   | `Sites.Read.All` | To find the site and its libraries, and to read library columns such as Document Type |
   | `Files.ReadWrite.All` | To save the workbook. It's asked for only when the user saves. |

6. Select **Grant admin consent for <your organization>**. Many tenants don't let users consent to these permissions themselves. Granting consent once for everyone means no one sees a consent prompt.

You don't need a client secret or a certificate. The app is a public client that runs in the browser, and it holds no secret.

## 2. Enter the settings in the app

The connector needs the following settings:

| Setting | Example | Notes |
| ------- | ------- | ----- |
| Tenant ID | `0a1b2c3d-…` | From step 4 |
| Client ID | `4e5f6a7b-…` | From step 4 |
| Site URL | `https://contoso.sharepoint.com/sites/FundLegal` | The site that holds the library |
| Library | `Documents` | Its name, or the end of its address (*Shared Documents*) |
| Workbook folder | `Rboreal` | A folder in that library for workbooks. It's created on the first save. |
| Redirect URI | *(blank)* | Leave it blank to use the page's own address. Set it only if you registered a different one. |

These go in **Settings › SharePoint**: choose *Live*, enter them, and save. *Test connection* then signs in and finds the site, the library and the workbook folder, saying which step failed if one does.

The app stays in demo mode until the tenant ID, client ID and site URL are all entered and the mode is *Live*. Choosing *Demo* again keeps the other settings. Pointing the app at another library keeps the workbook in the browser until it's opened or saved in that library, from **Settings › Workbook**.

## 3. What's kept where

| What | Where | Lifetime |
| ---- | ----- | -------- |
| The settings above | This browser's local storage, under `rboreal.sharepoint.config` | Until changed. None of them is a secret. |
| Sign-in tokens | MSAL's cache, in this tab's session storage | Until the tab closes or the user signs out |
| The workbook | The library, at `Rboreal/<name>.rboreal.json` | SharePoint's own, with its permissions and version history |
| Links to documents | In the workbook, as the documents' addresses | With the workbook |
| The documents | Only in SharePoint | Rboreal never copies them. It reads their details (name, size, version, modified by, library columns) when it shows them. |
| Demo saves | This browser's local storage, under `rboreal.sharepoint.demo` | Until cleared. Demo mode never touches a real tenant. |

**Saving safely.** Each save says which version of the workbook it replaces. If someone else has saved since it was opened, the save is refused, and the app is told who saved and when. The app then can't overwrite their work by accident. Every save is a new version in SharePoint's version history, so an older one can be restored there.

**Size limit.** A workbook over 4 MB is refused with a clear message. Larger files would need Graph's upload sessions, which aren't built yet.

## 4. Security

- **No passwords.** Sign-in happens on Microsoft's own page, through Microsoft's MSAL library ([vendor/msal/](../vendor/msal/)). The page opens in a popup. If the browser blocks popups, the app goes to that page instead and comes back afterwards. Multi-factor authentication and conditional access apply as usual. Rboreal's code receives short-lived access tokens, never a password.
- **Delegated access only.** Every request is made as the signed-in user. "All" in `Files.Read.All` means everything *this user* can already open, not everything in the tenant. A user sees in Rboreal only what SharePoint would show them anyway. Who may read or edit a workbook is set by the library's permissions.
- **Least privilege.** Reading needs only the three read permissions, so write access is requested only when a user saves the workbook. The connector makes no other kind of write: it never deletes, moves or shares files.
  - A tenant that wants a tighter boundary can look at Microsoft's `Sites.Selected` permission, which limits an app to sites an admin names. Supporting it would mean changing the connector's two scope lists and granting each site.
- **Tokens stay in the tab.** They're kept in session storage, so closing the tab ends the session. They're sent only to `graph.microsoft.com`. File downloads use the short-lived, pre-signed links that Graph returns, and those carry no token.
- **No other servers.** The connector talks only to Microsoft: Entra ID to sign in, and Graph for everything else. Rboreal has no backend that could see documents or tokens.

## 5. Checking the connection

1. Sign in. `SharePoint.connector.whoAmI()` should give your name.
2. List the libraries: `listDrives()`. Then list the top of your library: `listChildren()`.
3. Paste a document's link from SharePoint, using **Copy link** or the address bar, into `getItem('<link>')`. You should get its name, version and who last changed it.
4. Save a test workbook: `saveWorkbook(connector.workbookPath('Test'), { hello: 1 })`. Then look for it in the library's *Rboreal* folder.

If a step fails, the error says why:
- *Not configured*: a setting is missing.
- *Access denied*: the user has no access to the item, or consent wasn't granted.
- *Not found*: the address is wrong, or the item has been moved.
- *Conflict*: someone else has saved since the workbook was opened.

[app/tests/sharepoint-test.html](../app/tests/sharepoint-test.html) runs the connector's own checks, against the demo tenant and a stand-in for Graph.
