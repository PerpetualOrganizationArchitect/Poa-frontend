/**
 * AvatarUpload
 * Circular avatar picker with crop modal.
 * Uploads cropped image to IPFS and returns the CID.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Avatar,
  Button,
  Text,
  Icon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  useDisclosure,
  useToast,
  Spinner,
} from '@chakra-ui/react';
import { EditIcon, CloseIcon } from '@chakra-ui/icons';
import { FiCamera } from 'react-icons/fi';
import Cropper from 'react-easy-crop';
import { useIPFScontext } from '@/context/ipfsContext';
import useIpfsImage from '@/hooks/useIpfsImage';
import {
  validateImageFile,
  MAX_AVATAR_SIZE_BYTES,
  ACCEPTED_IMAGE_INPUT,
} from '@/util/imageUpload';

/**
 * Create a cropped image blob from the source image and crop area.
 * Outputs a square PNG at the given size, suitable for avatar use.
 */
async function getCroppedBlob(imageSrc, pixelCrop, outputSize = 256) {
  if (!imageSrc) throw new Error('Image source is required');
  if (!pixelCrop || pixelCrop.width <= 0 || pixelCrop.height <= 0) {
    throw new Error('Invalid crop area');
  }

  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to create image')),
      'image/png',
      0.92,
    );
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

function AvatarUpload({ avatarCid, localPreview, onUpload, onRemove, isDisabled }) {
  const { addToIpfs } = useIPFScontext();
  const resolvedAvatarSrc = useIpfsImage(avatarCid);
  const toast = useToast();
  const fileInputRef = useRef(null);
  const prevPreviewRef = useRef(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [isUploading, setIsUploading] = useState(false);
  const [rawImage, setRawImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Revoke previous blob URL when localPreview changes to prevent memory leaks
  React.useEffect(() => {
    if (prevPreviewRef.current && prevPreviewRef.current !== localPreview) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    prevPreviewRef.current = localPreview;
    return () => {
      if (prevPreviewRef.current) URL.revokeObjectURL(prevPreviewRef.current);
    };
  }, [localPreview]);

  const previewSrc = localPreview || resolvedAvatarSrc;
  const hasAvatar = Boolean(localPreview || avatarCid);

  const onFileSelected = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validateImageFile(file, MAX_AVATAR_SIZE_BYTES);
    if (!check.valid) {
      toast({ title: check.error, status: 'warning', duration: 3000 });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      onOpen();
    };
    reader.readAsDataURL(file);

    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [onOpen, toast]);

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleCropConfirm = useCallback(async () => {
    if (!rawImage || !croppedAreaPixels) return;

    setIsUploading(true);
    try {
      const croppedBlob = await getCroppedBlob(rawImage, croppedAreaPixels, 256);
      const result = await addToIpfs(croppedBlob);

      if (result?.path) {
        const blobUrl = URL.createObjectURL(croppedBlob);
        onUpload(result.path, blobUrl);
        toast({ title: 'Avatar uploaded', status: 'success', duration: 2000 });
      }
    } catch (err) {
      console.error('[AvatarUpload] Error:', err);
      toast({ title: 'Upload failed', description: err.message, status: 'error', duration: 3000 });
    } finally {
      setIsUploading(false);
      setRawImage(null);
      onClose();
    }
  }, [rawImage, croppedAreaPixels, addToIpfs, onUpload, toast, onClose]);

  const handleRemove = useCallback((e) => {
    e.stopPropagation();
    onRemove();
  }, [onRemove]);

  return (
    <>
      <VStack spacing={3}>
        <Box position="relative" cursor={isDisabled ? 'default' : 'pointer'}>
          <Avatar
            size="xl"
            src={previewSrc || undefined}
            bg="purple.500"
            border="3px solid"
            borderColor="purple.400"
          />
          {!isDisabled && (
            <Box
              position="absolute"
              bottom={0}
              right={0}
              bg="purple.500"
              borderRadius="full"
              p={1.5}
              cursor="pointer"
              onClick={() => fileInputRef.current?.click()}
              _hover={{ bg: 'purple.600' }}
              transition="background 0.15s"
            >
              <Icon as={FiCamera} color="white" boxSize={3.5} />
            </Box>
          )}
        </Box>

        <HStack spacing={2}>
          <Button
            size="xs"
            variant="ghost"
            colorScheme="purple"
            leftIcon={<EditIcon boxSize={3} />}
            onClick={() => fileInputRef.current?.click()}
            isDisabled={isDisabled || isUploading}
          >
            {hasAvatar ? 'Change' : 'Upload'}
          </Button>
          {hasAvatar && (
            <Button
              size="xs"
              variant="ghost"
              colorScheme="red"
              leftIcon={<CloseIcon boxSize={2} />}
              onClick={handleRemove}
              isDisabled={isDisabled || isUploading}
            >
              Remove
            </Button>
          )}
        </HStack>
      </VStack>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_INPUT}
        style={{ display: 'none' }}
        onChange={onFileSelected}
      />

      {/* Crop Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="md" isCentered closeOnOverlayClick={!isUploading}>
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent bg="gray.900" borderRadius="2xl">
          <ModalHeader color="white">Crop Avatar</ModalHeader>
          {!isUploading && <ModalCloseButton color="white" />}

          <ModalBody>
            <Box position="relative" height="300px" borderRadius="xl" overflow="hidden"
              opacity={isUploading ? 0.5 : 1} pointerEvents={isUploading ? 'none' : 'auto'}>
              {rawImage && (
                <Cropper
                  image={rawImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </Box>

            <VStack spacing={1} mt={4}>
              <Text fontSize="xs" color="gray.400">Zoom</Text>
              <Slider
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={setZoom}
                isDisabled={isUploading}
              >
                <SliderTrack bg="gray.700">
                  <SliderFilledTrack bg="purple.400" />
                </SliderTrack>
                <SliderThumb boxSize={4} />
              </Slider>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" color="gray.400" mr={3} onClick={onClose} isDisabled={isUploading}>
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleCropConfirm}
              isLoading={isUploading}
              loadingText="Uploading..."
            >
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default AvatarUpload;
