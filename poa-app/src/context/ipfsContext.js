import { create } from 'ipfs-http-client';
import { createContext, useContext } from 'react';

const IPFScontext = createContext();

export const useIPFScontext = () => {
    return useContext(IPFScontext);
}

// Helper to validate IPFS CID format
function isValidIpfsCid(hash) {
    if (!hash || typeof hash !== 'string') return false;
    // Skip if it's a hex bytes value from POP subgraph (starts with 0x)
    if (hash.startsWith('0x')) return false;
    // Valid CIDs start with Qm (v0) or ba (v1)
    return hash.startsWith('Qm') || hash.startsWith('ba');
}

// Convert bytes hash to displayable format (for future IPFS gateway use)
function bytesHashToString(bytesHash) {
    if (!bytesHash) return null;
    // If already a valid CID, return as-is
    if (isValidIpfsCid(bytesHash)) return bytesHash;
    // If it's a hex string, it needs to be decoded differently
    // For now, just return null as we can't directly use it with IPFS
    if (bytesHash.startsWith('0x')) {
        console.log('IPFS hash is in bytes format, cannot fetch directly:', bytesHash);
        return null;
    }
    return bytesHash;
}

export const IPFSprovider = ({children}) => {
    // Setup Infura IPFS client for fetch operations
    const auth = 'Basic ' + Buffer.from(process.env.NEXT_PUBLIC_INFURA_PROJECTID + ':' + process.env.NEXT_PUBLIC_INFURA_IPFS).toString('base64');
    const fetchIpfs = create({
        host: 'ipfs.infura.io',
        port: 5001,
        protocol: 'https',
        apiPath: '/api/v0',
        headers: {
            authorization: auth,
        },
    });

    // Setup The Graph IPFS client for add operations
    const addIpfs = create({
        host: 'api.thegraph.com',
        port: 443,
        protocol: 'https',
        apiPath: '/ipfs/api/v0',
    });

    async function addToIpfs(content) {
        try {
            const addedData = await addIpfs.add({ content });
            return addedData;
        } catch (error) {
            console.error("An error occurred while adding to IPFS via The Graph:", error);
            throw error; 
        }
    }

    async function fetchFromIpfs(ipfsHash) {
        console.log("fetching from IPFS", ipfsHash);

        // Validate and convert hash
        const validHash = bytesHashToString(ipfsHash);
        if (!validHash) {
            console.warn("Invalid or unsupported IPFS hash format:", ipfsHash);
            return null;
        }

        let stringData = '';
        try {
            for await (const chunk of fetchIpfs.cat(validHash)) {
                console.log("chunk:", chunk);
                stringData += new TextDecoder().decode(chunk);
            }
            console.log("stringData:", stringData);
            return JSON.parse(stringData);
        } catch (error) {
            console.error("Error fetching/parsing from IPFS:", error, "hash:", validHash);
            return null; // Return null instead of throwing to prevent crashes
        }
    }

    async function fetchImageFromIpfs(ipfsHash) {
        console.log("fetching image from IPFS", ipfsHash);

        // Validate and convert hash
        const validHash = bytesHashToString(ipfsHash);
        if (!validHash) {
            console.warn("Invalid or unsupported IPFS hash format for image:", ipfsHash);
            return null;
        }

        let binaryData = [];

        try {
            for await (const chunk of addIpfs.cat(validHash)) {
                binaryData.push(chunk);
            }

            // Convert binary data to Blob
            const blob = new Blob(binaryData, { type: 'image/png' });

            // Create Object URL from Blob
            const imageUrl = URL.createObjectURL(blob);
            console.log("Image URL:", imageUrl);

            return imageUrl;
        } catch (error) {
            console.error("Error creating blob from IPFS data:", error);
            return null; // Return null instead of throwing to prevent crashes
        }
    }
    

    return (
        <IPFScontext.Provider value={{
            fetchFromIpfs,
            fetchImageFromIpfs,
            addToIpfs,
        }}>
            {children}
        </IPFScontext.Provider>
    );
}
