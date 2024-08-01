import createClient from "openapi-fetch";
import { components, paths } from "./schema";
import { Wallet } from "./wallet/wallet";
import { stringToHex, getAddress, Address, hexToString, toHex } from "viem";

type AdvanceRequestData = components["schemas"]["Advance"];
type InspectRequestData = components["schemas"]["Inspect"];
type RequestHandlerResult = components["schemas"]["Finish"]["status"];
type RollupsRequest = components["schemas"]["RollupRequest"];
export type Notice = components["schemas"]["Notice"];
export type Payload = components["schemas"]["Payload"];
export type Report = components["schemas"]["Report"];
export type Voucher = components["schemas"]["Voucher"];

type InspectRequestHandler = (data: InspectRequestData) => Promise<void>;
type AdvanceRequestHandler = (
  data: AdvanceRequestData
) => Promise<RequestHandlerResult>;

const wallet = new Wallet();

const ERC721Portal = `0x237F8DD094C0e47f4236f12b4Fa01d6Dae89fb87`;

const rollupServer = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollupServer);

const handleAdvance: AdvanceRequestHandler = async (data) => {
  console.log("Received advance request data " + JSON.stringify(data));

  const sender = data["metadata"]["msg_sender"];
  const payload = data.payload;

  if (sender.toLowerCase() === ERC721Portal.toLowerCase()) {
    // Handle deposit
    const deposit = wallet.processErc721Deposit(payload);
    await sendNotice(stringToHex(deposit));
  } else {
    // Handle transfer or withdrawal
    try {
      const { operation, erc721, from, to, tokenId } = JSON.parse(hexToString(payload));

      if (operation === "transfer") {
        const transfer = wallet.transferErc721(
          getAddress(from as Address),
          getAddress(to as Address),
          getAddress(erc721 as Address),
          parseInt(tokenId)
        );
        console.log(transfer);
        await sendNotice(stringToHex(transfer));
      } else if (operation === "withdraw") {
        const withdraw = wallet.withdrawErc721(
          getAddress(ERC721Portal as Address),
          getAddress(from as Address),
          getAddress(erc721 as Address),
          parseInt(tokenId)
        );
        console.log(withdraw);
        await sendVoucher(JSON.parse(withdraw));
      } else {
        console.log("Unknown operation");
      }
    } catch (error) {
      console.error("Error processing payload:", error);
    }
  }

  return "accept";
};

const handleInspect: InspectRequestHandler = async (data) => {
  console.log("Received inspect request data " + JSON.stringify(data));

  try {
    const payloadString = hexToString(data.payload);
    const address = '0x' + payloadString.slice(0, 40);
    const erc721 = '0x' + payloadString.slice(40, 80);

    const balance = wallet.getBalance(getAddress(address as Address));
    let erc721balance = balance.getErc721Tokens(erc721 as Address);

    if (erc721balance === undefined) {
      throw new Error("ERC721 balance is undefined");
    }

    // Convert Set<number> to Uint8Array
    const erc721balanceArray = new Uint8Array(Array.from(erc721balance));

    await sendReport({ payload: toHex(erc721balanceArray) });
  } catch (error) {
    console.error("Error processing inspect payload:", error);
  }
};

const sendNotice = async (payload: Payload) => {
  await fetch(`${rollupServer}/notice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
};

const sendVoucher = async (payload: Voucher) => {
  await fetch(`${rollupServer}/voucher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
};

const sendReport = async (payload: Report) => {
  await fetch(`${rollupServer}/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload }),
  });
};

const main = async () => {
  const { POST } = createClient<paths>({ baseUrl: rollupServer });
  let status: RequestHandlerResult = "accept";
  while (true) {
    const { response } = await POST("/finish", {
      body: { status },
      parseAs: "text",
    });

    if (response.status === 200) {
      const data = (await response.json()) as RollupsRequest;
      switch (data.request_type) {
        case "advance_state":
          status = await handleAdvance(data.data as AdvanceRequestData);
          break;
        case "inspect_state":
          await handleInspect(data.data as InspectRequestData);
          break;
      }
    } else if (response.status === 202) {
      console.log(await response.text());
    }
  }
};

main().catch((e) => {
  console.log(e);
  process.exit(1);
});
