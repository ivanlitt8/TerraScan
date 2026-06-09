import MapaWorkspace from "@/components/MapaWorkspace";

export default function MapaPage() {
  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{ background: "var(--gray-1)" }}
    >
      <MapaWorkspace />
    </div>
  );
}
