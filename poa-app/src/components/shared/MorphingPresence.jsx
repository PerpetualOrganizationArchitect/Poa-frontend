import { useEffect, useId, useState } from "react";
import { Box } from "@chakra-ui/react";

const lavenderPoses = [
  "M40 16 C61 13 69 35 62 51 C55 67 35 78 22 65 C9 52 16 41 20 31 C24 21 28 18 40 16 Z",
  "M12 44 C16 23 45 23 58 34 C71 45 92 33 88 52 C84 71 55 72 42 59 C29 46 8 65 12 44 Z",
  "M48 10 C72 7 77 31 59 44 C41 57 68 78 49 89 C30 100 11 69 28 55 C45 41 22 13 48 10 Z",
];
const sagePoses = [
  "M60 84 C39 87 31 65 38 49 C45 33 65 22 78 35 C91 48 84 59 80 69 C76 79 72 82 60 84 Z",
  "M88 56 C84 77 55 77 42 66 C29 55 8 67 12 48 C16 29 45 28 58 41 C71 54 92 35 88 56 Z",
  "M52 90 C28 93 23 69 41 56 C59 43 32 22 51 11 C70 0 89 31 72 45 C55 59 78 87 52 90 Z",
];
const lilacPoses = [
  "M56 24 C74 18 85 35 77 52 C69 69 51 77 37 64 C23 51 31 34 42 29 C48 26 51 24 56 24 Z",
  "M36 18 C55 9 76 23 72 41 C68 59 73 79 55 83 C37 87 21 66 28 48 C35 30 18 27 36 18 Z",
  "M35 38 C42 19 64 14 76 30 C88 46 79 62 60 66 C41 70 34 86 23 69 C12 52 28 57 35 38 Z",
];

const morphTiming = {
  dur: "8s",
  keyTimes: "0;0.333333;0.666667;1",
  calcMode: "spline",
  keySplines: "0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1",
  repeatCount: "indefinite",
};

export default function MorphingPresence({ color, secondaryColor }) {
  const id = useId().replace(/:/g, "");
  const [motionAllowed, setMotionAllowed] = useState(false);

  useEffect(() => {
    // SVG animations must be removed explicitly for reduced motion.
    const preference = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const update = () => setMotionAllowed(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const fields = [
    {
      name: "lavender", color, light: "#F0DFFF", poses: lavenderPoses,
      opacity: 0.95, phase: "0s", cx: ["32%", "46%", "36%", "32%"], cy: ["30%", "38%", "45%", "30%"],
    },
    {
      name: "sage", color: secondaryColor, light: "#E0F8E9", poses: sagePoses,
      opacity: 0.85, phase: "-2s", cx: ["62%", "50%", "56%", "62%"], cy: ["58%", "48%", "64%", "58%"],
    },
    {
      name: "lilac", color: "#B5A0E8", light: "#F7EDFF", poses: lilacPoses,
      opacity: 0.5, phase: "-4.8s", cx: ["60%", "48%", "54%", "60%"], cy: ["28%", "40%", "32%", "28%"],
    },
  ];

  return (
    <Box as="svg" aria-hidden="true" focusable="false" viewBox="-12 -12 124 124" w="100%" h="100%" fill="none">
      <defs>
        {/* A small fixed blur softens the overlaps while retaining the folds.
            Staggered morphs and drifting light keep the interior in motion. */}
        <filter id={`${id}-blend`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        {fields.map((field) => (
          <radialGradient key={field.name} id={`${id}-${field.name}`} cx={field.cx[0]} cy={field.cy[0]} r="78%">
            <stop offset="0" stopColor={field.light} />
            <Box as="stop" offset="0.3" stopColor="currentColor" color={field.color} stopOpacity="0.92" />
            <Box as="stop" offset="0.68" stopColor="currentColor" color={field.color} stopOpacity="0.95" />
            <Box as="stop" offset="1" stopColor="currentColor" color={field.color} stopOpacity="0.35" />
            {motionAllowed && (
              <>
                <animate attributeName="cx" values={field.cx.join(";")} begin={field.phase} {...morphTiming} />
                <animate attributeName="cy" values={field.cy.join(";")} begin={field.phase} {...morphTiming} />
              </>
            )}
          </radialGradient>
        ))}
      </defs>
      <g filter={`url(#${id}-blend)`}>
        {fields.map((field) => (
          <path
            key={field.name}
            d={field.poses[0]}
            fill={`url(#${id}-${field.name})`}
            opacity={field.opacity}
          >
            {motionAllowed && (
              <animate
                attributeName="d"
                values={[...field.poses, field.poses[0]].join(";")}
                begin={field.phase}
                {...morphTiming}
              />
            )}
          </path>
        ))}
      </g>
    </Box>
  );
}
