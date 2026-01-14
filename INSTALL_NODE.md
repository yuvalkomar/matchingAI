# Installing Node.js on Windows

Node.js is required to run the frontend. Here are the easiest ways to install it:

## Option 1: Download from Official Website (Recommended)

1. **Visit**: https://nodejs.org/
2. **Download** the LTS (Long Term Support) version for Windows
3. **Run the installer** and follow the setup wizard
4. **Restart your terminal** after installation
5. **Verify installation**:
   ```powershell
   node --version
   npm --version
   ```

## Option 2: Using winget (Windows Package Manager)

If you have Windows 10/11 with winget installed:

```powershell
winget install OpenJS.NodeJS.LTS
```

Then restart your terminal and verify:
```powershell
node --version
npm --version
```

## Option 3: Using Chocolatey

If you have Chocolatey installed:

```powershell
choco install nodejs-lts
```

Then restart your terminal and verify:
```powershell
node --version
npm --version
```

## After Installation

Once Node.js is installed, you can proceed with the frontend setup:

```powershell
cd frontend
npm install
npm run dev
```

## Troubleshooting

- **"node is not recognized"**: Restart your terminal/PowerShell after installation
- **Still not working**: Check if Node.js is in your PATH:
  - Usually installed to: `C:\Program Files\nodejs\`
  - Add to PATH if needed via System Environment Variables


