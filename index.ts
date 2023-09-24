import { ServerWebSocket } from "bun";

type GnoChessData = {
    token: string;
}
enum GnoRPC {
    PING = "ping",
    PONG = "pong",
    JOINED_LOBBY = "joinedLobby",
    LEFT_LOBBY = "leftLobby",
    JOINED_GAME = "joinedGame",
    LEFT_GAME = "leftGame",
    REQUEST_DRAW = "requestDraw",
    TURN_TIMER_START = "turnTimerStart",
    TURN_TIMER_END = "turnTimerEnd",
    MADE_MOVE = "madeMove",
    ERROR = "error",
    GET_STATS = "getStats",
}
type ChessPos = `${"a" | "b" | "c" | "d" | "e" | "f" | "g" | "h"}${"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"}`;
type ChessMove = [ChessPos, ChessPos]
type GnoRPCParams = {
    "ping": [],
    "pong": [],
    "joinedLobby": [],
    "leftLobby": [],
    "joinedGame": [number, ChessSide],
    "leftGame": [],
    "requestDraw": [number],
    "turnTimerStart": [number],
    "turnTimerEnd": [number],
    "madeMove": [ChessMove],
    "error": [string],
    "getStats": [],
}

type GnoChessMsgDataGeneric<T extends GnoRPC> = {
    type: T,
    params: GnoRPCParams[T]
}
enum ChessSide {
    WHITE = 'white',
    BLACK = 'black'
}
type GameMoves = Array<ChessMove>
type GnoChessMsgData = { [K in GnoRPC]: GnoChessMsgDataGeneric<K> }[GnoRPC]
const Players: string[] = [];
const Games: Map<number, [string, string, 0 | 1, GameMoves]> = new Map(); // 0 or 1 is whose turn it is
const InGame: Map<string, number | null> = new Map();
function makeError(errorMsg: string): GnoChessMsgDataGeneric<GnoRPC.ERROR> {
    return {
        type: GnoRPC.ERROR,
        params: [errorMsg]
    }
}
function sendMessage(ws: ServerWebSocket<GnoChessData>, msg: GnoChessMsgData) {
    return ws.send(JSON.stringify(msg));
}
const server = Bun.serve<GnoChessData>({
    port: 8090,
    fetch(req, server) {
        // upgrade the request to a WebSocket

        if (server.upgrade(req, {
            data: {
                token: new URL(req.url).searchParams.get("token"),
            }
        })) {
            return // do not return a Response
        }
        return new Response("Upgrade failed :(", { status: 500 })
    },
    websocket: {
        open(ws) {
            Players.push(ws.data.token);
            ws.subscribe(ws.data.token)
        },
        message(ws, message) {
            let msg: GnoChessMsgData
            try {
                msg = JSON.parse(message.toString())
            } catch (e) {
                sendMessage(ws, makeError("Could not parse message."))
                return
            }
            switch (msg.type) {
                case GnoRPC.PING:
                    sendMessage(ws, { type: GnoRPC.PONG, params: [] })
                    break
                case GnoRPC.JOINED_LOBBY:
                    InGame.set(ws.data.token, null)
                    break
                case GnoRPC.LEFT_LOBBY:
                    InGame.delete(ws.data.token)
                    break
                case GnoRPC.JOINED_GAME:
                    InGame.set(ws.data.token, msg.params[0]);
                    ws.subscribe("game"+msg.params[0]);                    
                    const game: typeof Games extends Map<number, infer I> ? I : never = Games.get(msg.params[0]) || ['', '', 0, []]
                    let opponent:string;
                    if (msg.params[1] == ChessSide.WHITE) {
                        game[0] = ws.data.token
                        opponent = game[1]
                    } else {
                        game[1] = ws.data.token
                        opponent = game[0]
                    }
                    Games.set(msg.params[0], game)                    
                    ws.publish("game"+msg.params[0], message)                    
                    break
                case GnoRPC.LEFT_GAME:
                    const leftGame = InGame.get(ws.data.token)
                    if (leftGame) {
                        InGame.set(ws.data.token, null)
                        ws.publish("game"+leftGame, message)                    
                    }
                    break
                case GnoRPC.MADE_MOVE:
                    const inGame = InGame.get(ws.data.token)
                    if (inGame) {
                        const theGame = Games.get(inGame)
                        if (theGame) {
                            theGame[3].push(msg.params[0])
                            theGame[2] ? theGame[2] = 0 : theGame[2] = 1
                            Games.set(inGame, theGame)
                            ws.publish("game"+inGame, message)                    
                        }
                    }
                case GnoRPC.REQUEST_DRAW:

                    InGame.set(ws.data.token, null);
                    break;
                case GnoRPC.GET_STATS:
                    console.log(InGame);
                    console.log(Players);
                    console.log(Games);
                    break;


            }
         }, 
        close(ws, code, message) { }, 
    },
});
