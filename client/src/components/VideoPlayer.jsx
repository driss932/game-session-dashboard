// Match replay video. Loaded with React.lazy, so this code is a separate
// chunk that's only downloaded when someone opens a completed match.
//
// Efficient video handling:
//  - preload="none": nothing is downloaded until the user presses play
//  - poster: a ~10 KB WebP still frame is shown instead of the video
//  - the server supports HTTP Range requests, so the browser streams the
//    file and can seek without downloading all of it; the MP4 is encoded with
//    "faststart" so playback can begin immediately
//  - key={src}: switching matches creates a fresh <video>, so the previous
//    download stops instead of continuing in the background
export default function VideoPlayer({ src, poster, title }) {
  return (
    <figure className="video">
      <video
        key={src}
        controls
        preload="none"
        playsInline
        poster={poster || undefined}
        width={640}
        height={360}
        aria-label={`Replay: ${title}`}
      >
        <source src={src} type="video/mp4" />
        Your browser can’t play this video. <a href={src}>Download it</a>.
      </video>
      <figcaption>Match replay</figcaption>
    </figure>
  );
}
