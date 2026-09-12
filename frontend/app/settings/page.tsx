"use client";

import { useRouter } from "next/navigation";
import { logoutRequest } from "@/lib/api-client";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const router = useRouter();

  async function handleLogout() {
    await logoutRequest();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-ash-50">Settings</h1>
        <p className="text-sm text-ash-400">Session and account.</p>
      </div>

      <Panel>
        <PanelHeader><PanelTitle>Session</PanelTitle></PanelHeader>
        <PanelBody className="flex items-center justify-between">
          <p className="text-sm text-ash-200">Sign out of this device.</p>
          <Button variant="secondary" onClick={handleLogout}>Sign out</Button>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader><PanelTitle>About</PanelTitle></PanelHeader>
        <PanelBody className="flex flex-col gap-2 text-sm text-ash-200">
          <p>
            This application is intended for legitimate participation in Binance Spot
            promotional trading-volume programs. It does not implement wash trading,
            spoofing, or any mechanism designed to manufacture volume artificially, and it
            has no withdrawal capability.
          </p>
          <p className="text-ash-400">
            You are responsible for ensuring your trading activity complies with the specific
            terms of whichever Binance promotion you configure.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
