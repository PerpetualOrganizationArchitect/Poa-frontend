import { Box, VisuallyHidden } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import MorphingPresence from "@/components/shared/MorphingPresence";

const orbit = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const motionOk = "@media (prefers-reduced-motion: no-preference)";
const sizeMap = { xs: 3, sm: 4, md: 6, lg: 8, xl: 12, "2xl": 56 };

export default function PulseLoader({
  size = "md",
  color = "amethyst.400",
  secondaryColor = color,
  label = "Loading",
  ...props
}) {
  const large = size === "2xl";

  return (
    <Box
      role={label ? "status" : undefined}
      position="relative"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      w={sizeMap[size] || sizeMap.md}
      h={sizeMap[size] || sizeMap.md}
      color={color}
      {...props}
    >
      {label && <VisuallyHidden>{label}</VisuallyHidden>}
      {large ? (
        <MorphingPresence color={color} secondaryColor={secondaryColor} />
      ) : (
        <Box
          as="svg"
          aria-hidden="true"
          viewBox="0 0 100 100"
          w="100%"
          h="100%"
          fill="none"
          focusable="false"
        >
          <circle cx="50" cy="50" r="43" stroke="currentColor" strokeWidth="5" opacity="0.18" />

          <Box
            as="g"
            sx={{
              transformOrigin: "50px 50px",
              transformBox: "view-box",
              [motionOk]: { animation: `${orbit} 3.2s linear infinite` },
            }}
          >
            <path
              d="M50 7 A43 43 0 0 1 93 50"
              stroke="currentColor"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <Box as="circle" cx="93" cy="50" r="4" fill="currentColor" color={secondaryColor} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
