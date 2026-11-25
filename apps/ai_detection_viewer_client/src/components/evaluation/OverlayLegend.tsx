/**
 * Legend of the camera image in evaluate mode (F5): which line is the model's
 * and which is the dataset's.
 *
 * "approx." is always there (Immutable Rule #6): a label's 2D rectangle is a
 * 3D box projected into the photo — looser than the object, and not a
 * hand-drawn 2D annotation. Reading an IoU without knowing that misleads.
 */
export function OverlayLegend() {
  return (
    <>
      <span className="inline-flex items-center gap-1">
        <span className="w-3.5 border-t-2 border-zinc-300" />
        model
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-3.5 border-t-2 border-dashed border-zinc-300" />
        label · approx. (projected 3D box)
      </span>
    </>
  );
}
