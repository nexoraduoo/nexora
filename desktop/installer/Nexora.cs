// Nexora-Setup.exe: one small file that installs Nexora on Windows and opens it. About 15 KB.
//
//  - First run (any location): copies itself to %LOCALAPPDATA%\Nexora\Nexora.exe, adds "Nexora" to the Start menu and the
//    Desktop, then opens the app.
//  - Every later run: opens the app. The app is your Nexora website in its own window (Microsoft Edge, which every
//    Windows 10/11 PC has; Chrome and Brave are used if Edge is missing), so it always shows the newest version.
//  - "Nexora.exe --uninstall" removes the shortcuts and the folder.
//
// Built by desktop\make-installer.ps1 (the address below is filled in at build time).
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;

static class NexoraSetup
{
    const string Url = "__URL__";
    const string AppName = "Nexora";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    static void Say(string text, bool error = false)
    {
        MessageBoxW(IntPtr.Zero, text, AppName, error ? 0x10u : 0x40u); // error icon / information icon
    }

    static int Main(string[] args)
    {
        // test mode (used by the build checks): everything happens inside one folder, nothing is opened
        string test = null;
        for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "--test") test = args[i + 1];

        string self = Assembly.GetExecutingAssembly().Location;
        string home = test ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
        string installed = Path.Combine(home, "Nexora.exe");
        string desktop = test != null ? Path.Combine(test, "Desktop") : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string startMenu = test != null ? Path.Combine(test, "StartMenu") : Environment.GetFolderPath(Environment.SpecialFolder.Programs);

        if (Array.IndexOf(args, "--uninstall") >= 0)
        {
            TryDelete(Path.Combine(desktop, AppName + ".lnk"));
            TryDelete(Path.Combine(startMenu, AppName + ".lnk"));
            // the running file cannot delete itself, so a tiny helper removes the folder a moment later
            try { Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q \"" + home + "\"") { CreateNoWindow = true, UseShellExecute = false }); } catch { }
            if (test == null) Say("Nexora was removed from this computer. Your music and playlists stay safe in your account.");
            return 0;
        }

        bool alreadyInstalled = string.Equals(Path.GetFullPath(self), Path.GetFullPath(installed), StringComparison.OrdinalIgnoreCase);
        if (!alreadyInstalled)
        {
            try
            {
                Directory.CreateDirectory(home);
                try { File.Copy(self, installed, true); } catch (IOException) { /* the installed copy is open right now: fine */ }
                Directory.CreateDirectory(desktop);
                Directory.CreateDirectory(startMenu);
                MakeShortcut(Path.Combine(desktop, AppName + ".lnk"), installed);
                MakeShortcut(Path.Combine(startMenu, AppName + ".lnk"), installed);
                if (test == null) Say("Nexora is installed.\n\nYou will find it on your Desktop and in the Start menu. Sign in once and you are set.");
            }
            catch (Exception e)
            {
                Say("Nexora could not be installed here (" + e.Message + ").\nIt will still open now.", true);
            }
        }

        if (test != null) return 0;
        return Open();
    }

    static int Open()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] browsers =
        {
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf, @"BraveSoftware\Brave-Browser\Application\brave.exe"),
        };
        foreach (string b in browsers)
        {
            if (!File.Exists(b)) continue;
            try { Process.Start(b, "--app=" + Url); return 0; } catch { }
        }
        try { Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true }); return 0; }
        catch { Say("Could not open a browser. Please open " + Url + " yourself.", true); return 1; }
    }

    static void MakeShortcut(string path, string target)
    {
        Type t = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(t);
        object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
        Type lt = lnk.GetType();
        lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { target });
        lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { Path.GetDirectoryName(target) });
        lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { target + ",0" });
        lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { "Nexora: ad-free music" });
        lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
    }

    static void TryDelete(string file)
    {
        try { if (File.Exists(file)) File.Delete(file); } catch { }
    }
}
