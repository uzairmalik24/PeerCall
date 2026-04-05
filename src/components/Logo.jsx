export default function Logo({ size = 36, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="48" height="48" rx="14" fill="url(#logo-grad)" />
      <path
        d="M16 18.5C16 17.1193 17.1193 16 18.5 16H20.5C21.8807 16 23 17.1193 23 18.5V20.5C23 21.8807 21.8807 23 20.5 23H18.5C17.1193 23 16 21.8807 16 20.5V18.5Z"
        fill="white"
        opacity="0.9"
      />
      <path
        d="M25 27.5C25 26.1193 26.1193 25 27.5 25H29.5C30.8807 25 32 26.1193 32 27.5V29.5C32 30.8807 30.8807 32 29.5 32H27.5C26.1193 32 25 30.8807 25 29.5V27.5Z"
        fill="white"
        opacity="0.9"
      />
      <path
        d="M14 28C14 26.8954 14.8954 26 16 26H20C21.1046 26 22 26.8954 22 28V32C22 33.1046 21.1046 34 20 34H16C14.8954 34 14 33.1046 14 32V28Z"
        fill="white"
        opacity="0.5"
      />
      <path
        d="M26 16C26 14.8954 26.8954 14 28 14H32C33.1046 14 34 14.8954 34 16V20C34 21.1046 33.1046 22 32 22H28C26.8954 22 26 21.1046 26 20V16Z"
        fill="white"
        opacity="0.5"
      />
      <path
        d="M21 21L27 27"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.8"
      />
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c5cfc" />
          <stop offset="1" stopColor="#4ecdc4" />
        </linearGradient>
      </defs>
    </svg>
  )
}
