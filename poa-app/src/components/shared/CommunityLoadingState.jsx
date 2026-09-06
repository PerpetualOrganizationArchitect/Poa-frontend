import { useEffect, useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import PulseLoader from "@/components/shared/PulseLoader";
import { loadingQuotes } from "@/components/shared/loadingQuotes";

const settle = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

export default function CommunityLoadingState({
  label = "Loading your community…",
  description,
  fullScreen = false,
  children,
}) {
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    // Choose after hydration, and keep the thought still for this whole wait.
    setQuote(loadingQuotes[Math.floor(Math.random() * loadingQuotes.length)]);
  }, []);

  const content = (
    <Box
      w="calc(100% - 32px)"
      maxW="440px"
      mx="auto"
      my={6}
      px={{ base: 6, sm: 10 }}
      py={{ base: 8, sm: 10 }}
      borderRadius="32px"
      bg="#FCFAFF"
      border="1px solid rgba(153, 126, 190, 0.16)"
      boxShadow="0 16px 64px rgba(101, 78, 133, 0.07)"
      textAlign="center"
      color="warmGray.800"
    >
      <Text fontSize="10px" letterSpacing="0.2em" fontWeight="600" color="warmGray.600">
        A MOMENT, TOGETHER
      </Text>

      <Box position="relative" w="224px" h="224px" mx="auto" my={4} display="grid" placeItems="center">
        <PulseLoader size="2xl" color="#B98BE5" secondaryColor="#83CEA9" label={null} />
      </Box>

      <Text role="status" fontSize="sm" fontWeight="500" color="warmGray.700" overflowWrap="anywhere">
        {label}
      </Text>
      {description && <Text mt={3} fontSize="sm" lineHeight="1.7" color="warmGray.600">{description}</Text>}

      <Box w="32px" h="1px" bg="#DDD4E8" mx="auto" my={6} aria-hidden="true" />
      <Box minH={{ base: "130px", sm: "108px" }} display="flex" alignItems="center" justifyContent="center">
        {quote && (
          <Text
            as="blockquote"
            m={0}
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize={{ base: "21px", sm: "23px" }}
            lineHeight="1.5"
            letterSpacing="-0.02em"
            color="warmGray.700"
            sx={{ "@media (prefers-reduced-motion: no-preference)": { animation: `${settle} 1.2s ease-out both` } }}
          >
            “{quote}”
          </Text>
        )}
      </Box>
      {children && <Box mt={6}>{children}</Box>}
    </Box>
  );

  return fullScreen ? (
    <Box minH="100svh" display="flex" alignItems="center" justifyContent="center" background="linear-gradient(145deg, #F2F6F0, #F5EFFB 55%, #EEEBF7)">
      {content}
    </Box>
  ) : content;
}
