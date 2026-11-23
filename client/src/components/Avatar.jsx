import { memo, useState } from 'react';
import { initials } from '../lib/format.js';

// Player photo, done efficiently:
//  - srcSet offers a 64px and a 128px WebP; the browser downloads only the
//    one it needs for the screen's pixel density
//  - width/height reserve space so the layout doesn't jump when it loads (no CLS)
//  - loading="lazy" + decoding="async" defer off-screen images and keep
//    decoding off the main thread
//  - if there's no photo or it fails to load, show coloured initials instead
function Avatar({ name, photoUrl, size = 40 }) {
  const [failed, setFailed] = useState(false);

  if (!photoUrl || failed) {
    const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
    return (
      <span className="avatar avatar--initials" style={{ width: size, height: size, background: `hsl(${hue} 55% 42%)` }} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }

  const small = photoUrl.replace(/-128\.webp$/, '-64.webp');
  const srcSet = small !== photoUrl ? `${small} 64w, ${photoUrl} 128w` : undefined;

  return (
    <img
      className="avatar"
      src={small}
      srcSet={srcSet}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={`Photo of ${name}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default memo(Avatar);
