set HILINK_SERIAL=acwa-e8fa-65af-13df
set BRIDGE_ALLOW_CONTROL=true

cd C:\abuts.fit\hi-link\bridge-service\HiLinkBridgeService\bin\x86\Debug\net8.0
start "HiLinkBridgeService" HiLinkBridgeService

cd C:\abuts.fit\hi-link\bridge-node
npm run start