import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import CanvasStudio from "./CanvasStudio";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  onTimelineRefresh?: () => Promise<void> | void;
  initialStatusFilter?: string | null;
}

export default function WorkspaceTabCanvas(props: Props) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div className="animate-fade-in">
        <CanvasStudio
          {...props}
          fullscreen={false}
          onToggleFullscreen={() => setFullscreen(true)}
        />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          className="max-w-none w-screen h-screen p-0 gap-0 rounded-none border-0 sm:rounded-none translate-x-0 translate-y-0 left-0 top-0 data-[state=open]:slide-in-from-bottom-2"
          style={{ transform: "none" }}
        >
          <div className="h-screen w-screen">
            <CanvasStudio
              {...props}
              fullscreen={true}
              onToggleFullscreen={() => setFullscreen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
