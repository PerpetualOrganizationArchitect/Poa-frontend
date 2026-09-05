import { Box, VisuallyHidden } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

const breathe = keyframes`
  0%, 100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
  }
`;

const ripple = keyframes`
  0% {
    transform: scale(1);
    opacity: 0.55;
  }
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
`;

const motionOk = "@media (prefers-reduced-motion: no-preference)";

const sizeMap = {
  xs: { box: 3, dot: "4px", ring: "1px" },
  sm: { box: 4, dot: "6px", ring: "1px" },
  md: { box: 6, dot: "8px", ring: "1.5px" },
  lg: { box: 8, dot: "10px", ring: "1.5px" },
  xl: { box: 12, dot: "14px", ring: "2px" },
};

export default function PulseLoader({
  size = "md",
  color = "coral.400",
  label = "Loading",
  ...props
}) {
  const s = sizeMap[size] || sizeMap.md;

  return (
    <Box
      role="status"
      position="relative"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      w={s.box}
      h={s.box}
      {...props}
    >
      <VisuallyHidden>{label}</VisuallyHidden>
      <Box
        position="absolute"
        w={s.dot}
        h={s.dot}
        borderRadius="full"
        bg={color}
        sx={{ [motionOk]: { animation: `${breathe} 2s ease-in-out infinite` } }}
      />
      <Box
        position="absolute"
        w={s.dot}
        h={s.dot}
        borderRadius="full"
        border={`${s.ring} solid`}
        borderColor={color}
        sx={{ [motionOk]: { animation: `${ripple} 2s ease-out infinite` } }}
      />
      <Box
        position="absolute"
        w={s.dot}
        h={s.dot}
        borderRadius="full"
        border={`${s.ring} solid`}
        borderColor={color}
        sx={{ [motionOk]: { animation: `${ripple} 2s ease-out 1s infinite` } }}
      />
    </Box>
  );
}
