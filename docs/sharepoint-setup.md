# Connecting Dendra to SharePoint

Dendra links records to documents in SharePoint, browses and searches a document library, and can keep its workbook there. A team then shares one system of record under SharePoint's permissions. This guide is for the Microsoft 365 administrator who registers the app, and for whoever sets it up. The code is [app/core/sharepoint.js](../app/core/sharepoint.js) and [app/core/store.js](../app/core/store.js).

## 1. Register the app in Microsoft Entra ID

1. In the [Entra admin center](https://entra.microsoft.com), open **Identity › Applications › App registrations › New registration**.
2. **Name:** Dendra. **Supported account types:** *Accounts in this organizational directory only*.
3. **Redirect URI:** choose the platform **Single-page application (SPA)**, and enter the exact address Dendra's page is served from, such as `https://dendra.contoso.com/index.html`. During development, use `http://localhost:8080/index.html`.
   - The address must be `https://`, or `http://localhost`. A page opened as a file (`file:///…`) can't sign in, or open the File Picker. It can still keep workbooks in the browser or in a file.
4. Register, then copy the **Application (client) ID** and the **Directory (tenant) ID** from **Overview**.
5. Under **API permissions › Add a permission**, add these delegated permissions:

   | API | Permission | Why |
   | --- | --- | --- |
   | Microsoft Graph | `User.Read` | To know who's signed in, and to record changes under their name |
   | Microsoft Graph | `Files.ReadWrite.All` | To read documents, and to save the workbook in the library |
   | Microsoft Graph | `Sites.Read.All` | To find the site and the library from their address |
   | SharePoint | `AllSites.Read` | For Microsoft's File Picker, which SharePoint hosts |

6. Select **Grant admin consent for *your organization***, so that no one meets a consent prompt.

There's no client secret or certificate. Dendra runs in the browser and holds no secret.

## 2. Enter the settings

Each person enters three settings, once, in Dendra's settings:

| Setting | Example |
| --- | --- |
| Tenant ID | `0a1b2c3d-…` |
| Client ID | `4e5f6a7b-…` |
| Library | `https://contoso.sharepoint.com/sites/FundLegal/Shared%20Documents/Dendra`: the library's address, or a folder's in it, as the browser shows it. Workbooks are saved there, and browsing starts there. |

## 3. What's kept where

| What | Where |
| --- | --- |
| The settings | This browser's local storage, under `dendra.sharepoint`. None is a secret. |
| Signing in | MSAL's cache, in this browser's local storage, so one sign-in serves every tab, until signing out. Entra ID gives a single-page app refresh tokens that last 24 hours, so a sign-in may need renewing once a day. |
| The workbook | The library, as `<name>.dendra.json`: its log of changes, one to a line, each saying who made it and when. Every change is also kept in this browser as it's made, so nothing waits on the network. |
| Documents | Only in SharePoint. Dendra records their links, and reads their details (name, version, modified by and when) when it shows them. |

**Saving.** A save reads the workbook in the library, takes the union of its changes and the ones in this browser, and writes the result back on condition that no one has saved since (Graph's `If-Match`). If someone has, Dendra reads it again and repeats. Nothing is lost, so no one is ever asked to choose between versions. Changes made at the same moment to the same value are shown side by side, with their authors, for someone to keep one. Dendra looks for others' changes every 20 seconds while its page is in view, and whenever it comes back into view.

## 4. Security

- **No passwords.** Sign-in happens on Microsoft's own page, through Microsoft's MSAL library ([vendor/msal/](../vendor/msal/)), with multi-factor authentication and conditional access as usual.
- **Delegated access only.** Every request is made as the signed-in person. "All" in `Files.ReadWrite.All` means everything that person can already open. Who may read or change a workbook is set by the library's permissions.
- **Few writes.** Dendra writes only its own workbook files. It never deletes, moves or shares a file.
- **No other servers.** Dendra talks only to Microsoft: Entra ID to sign in, Graph for the library, and SharePoint for the File Picker. Tokens go only there, and file downloads use Graph's short-lived signed links, which carry none.
- A tenant that wants a tighter boundary can look at Microsoft's `Sites.Selected` permission, which limits an app to the sites an administrator names.

## 5. Checking the connection

In the browser's console, on Dendra's page:
1. `await SharePoint.signIn()` gives your name.
2. `await SharePoint.library()` gives the folder the settings name. If it fails, the address is wrong, or you can't open that library.
3. `await SharePoint.item('<a link from Copy link>')` gives the document's name, version, and who changed it when.

[app/tests/store-test.html](../app/tests/store-test.html) checks the connector and the store against stand-ins for Graph and MSAL.
