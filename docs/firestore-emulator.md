# Leaderboard: the local Firestore emulator

How to run the leaderboard locally. For the data model, security rules,
environments, and deployment, see [`firebase-leaderboards.md`](./firebase-leaderboards.md).

The leader board is backed by [Google Firestore](https://firebase.google.com). For local development the app talks to the **Firestore emulator** by default — fully local, no cloud, no deploy. The flag `VITE_FIRESTORE_EMULATOR=1` is already set in `.env.development`.

`dev` is the whole loop in one command — it wraps Vite in `firebase emulators:exec`, so the Firestore emulator (on :8080, + UI) comes up, gets **seeded with sample scores automatically**, and the app dev server starts against it; everything shuts down when you stop it. (Each `dev` starts a fresh in-memory emulator, so the auto-seed writes exactly one clean set every time — no accumulation.) `firebase-tools` is a pinned **devDependency** of this app (installed by `pnpm install`, invoked as the `firebase` binary), so the only extra prerequisite is **Java** — the Firestore emulator is a Java program (`java -jar cloud-firestore-emulator-*.jar`), and firebase-tools does not bundle a JRE.

## Java

**Usually automatic.** `pnpm install` runs a root `postinstall` ([`scripts/ensure-java.mjs`](../scripts/ensure-java.mjs)) that installs a user-local Temurin JRE 21 into `~/.local` (no `sudo`) when `java` isn't already on your PATH. It's idempotent and never fails the install, and it skips when `CI` or `SKIP_JRE_SETUP=1` is set, or on unsupported platforms.

If that skipped and you need Java (or prefer a system-wide install), do it manually — **install a JRE (Java 11+; 21 recommended):**

```bash
# Debian / Ubuntu / Pop!_OS
sudo apt update && sudo apt install -y openjdk-21-jre-headless

# Fedora
sudo dnf install -y java-21-openjdk-headless

# macOS (Homebrew)
brew install openjdk@21

java -version   # verify: should print "openjdk 21.x" (or 11+)
```

No `sudo`? Install a JRE into your home directory instead (no root needed):

```bash
curl -fsSL -o /tmp/jre21.tgz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse"
mkdir -p ~/.local/lib && tar xzf /tmp/jre21.tgz -C ~/.local/lib
ln -sf ~/.local/lib/jdk-21*-jre/bin/java ~/.local/bin/java   # ~/.local/bin is already on PATH
java -version
```

Without Java, `dev` and `db:start` fail with `Could not spawn 'java -version'`. Install it to a permanent location — a JRE unpacked under `/tmp` disappears when the OS cleans temp files.

## Running it

```bash
pnpm run dev       # emulator (:8080 + UI) + auto-seed + app dev server — one command
```

That's the everyday loop. The other DB scripts are for when you want to run pieces separately:

```bash
pnpm run db:start   # emulator only (stays up across app restarts); pair with dev:no-db
pnpm run db:seed    # seed a separately-running emulator (what dev does for you)
pnpm run db:stop    # kill a stray/orphaned emulator holding :8080
```

## Skipping the emulator

To skip it entirely — for quick UI-only work, or if you don't have a JDK — run `pnpm run dev:no-db` (plain Vite) and set `VITE_FIRESTORE_EMULATOR=` (empty) in a local, gitignored `.env.local`; the app then uses the cloud `mw-test` namespace instead.
