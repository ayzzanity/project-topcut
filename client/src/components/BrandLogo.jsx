export default function BrandLogo({ size = 'md', showText = true, className = '' }) {
  const imageSize = size === 'lg' ? 'h-24 w-24' : size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/brand/zamboanga-fallen-logo.jpg"
        alt="Zamboanga Fallen logo"
        className={`${imageSize} rounded-md border border-bbx-line bg-white object-contain shadow-sm`}
      />
      {showText ? (
        <div className="min-w-0">
          <div className="brand-title truncate text-lg font-black leading-tight text-bbx-ink">PROJECT TOPCUT</div>
          <div className="truncate text-xs font-bold uppercase text-bbx-red">ZC Rankings</div>
        </div>
      ) : null}
    </div>
  );
}
