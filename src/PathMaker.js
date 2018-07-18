var RoomHolder          = require('RoomHolder');

class PathMaker
{
    static roomnameToCoord( roomName )
    {
        let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
        let latChar = parsed[1];
        let latVal  = parsed[2];
        let lngChar = parsed[3];
        let lngVal  = parsed[4];
        console.log(latChar+' '+latVal+' '+lngChar+' '+lngVal);
    }

    // Assigns a relative score to a room to feed algorithms to decide
    // whether to visit it relative to other rooms.
    //   Higher scores are considered worse (generally, more dangerous).
    static scoreRoom( cbRoomName , debugFlag )
    {
        let rmem = Memory.rooms[cbRoomName];
        let room = Game.rooms[cbRoomName];
        let costs;

        // If we've never been there at all...
        if(!rmem && !room){
            // return a high cost to prefer visited & known
            // routes.  But don't outright ignore it lest we not find
            // a route that could have gone this way.
            return 500;
        }

        // Prefer our own rooms
        if(rmem.owner == 'me'){
            if(debugFlag)
                console.log('.. eval '+cbRoomName+' R=1 (mine)');
            return 1;
        }
        if(rmem.hostRoom){
            let rhObj = RoomHolder.get(rmem.hostRoom);
            if(rhObj && rhObj.m_room ){

                if(rmem.hostileCt == 0 && !rmem.keeperRoom){
                    if(debugFlag)
                        console.log('.. eval '+cbRoomName+' R=2 (hosted)');
                    return 2;
                }
                else if(rmem.keeperRoom){
                    // Only treat this as hosted if home room is L8
                    if(rhObj.m_room.controller.level == 8) {
                        if(debugFlag)
                            console.log('.. eval '+cbRoomName+' R=2 (hosted SK)');
                        return 5;
                    }
                }
                // If hostile, fall through - it's possible we're overrun.
            }
        }

        // Followed by highways.
        let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(cbRoomName);
        let fMod = parsed[1] % 10;
        let sMod = parsed[2] % 10;
        let isHW = (fMod === 0 || sMod === 0);
        let score;

        if(isHW)
            score = 3;
        else
            score = 5;

        // Avoid hostile rooms, unless it's our origin or destination.
        // Again, if it's our only choice, well.. maybe ok..
        if(rmem.keeperRoom)
            score+=550;
        if(rmem.hostileCt && rmem.hostileCt > 0)
            score+=50;
        if(rmem.owner == 'reserved' && rmem.hostileCt && rmem.hostileCt > 0)
            score+=500;
        if(rmem.hostileTowerCt && rmem.hostileTowerCt > 0)
            score+=5000;
        if(debugFlag)
            console.log('.. eval '+cbRoomName+' R='+score+'(scored)');

        return score;

    }

    // Returns an array of safe room names to travel from source to destination
    // room name.
    static getSafeRoute( fromRoomName, toRoomName, debugFlag )
    {
        // Helper callback to score a room when deciding to visit it.
        // Invoked from getSafeRoute.  Note this expects vars fromRoomName
        // and toRoomName to be set in addition to passed parameter.
        var roomEvalCallback = function( cbRoomName )
        {
            let rmem = Memory.rooms[cbRoomName];
            let room = Game.rooms[cbRoomName];
            let costs;

            // If it's where we are going, pretty much ignore the normal
            // checks.
            if(cbRoomName == toRoomName || cbRoomName == fromRoomName){
                if(debugFlag)
                    console.log('.. eval '+cbRoomName+' R=1 (dest or source)');
                return 1;
            }

            return m_this.scoreRoom( cbRoomName, debugFlag );
        };

        let route;
        let m_this = this;

        let key = fromRoomName+'_'+toRoomName;
        if(!Memory.safeCache)
            Memory.safeCache = {}
        if(!Memory.safeCache.hits){
            Memory.safeCache.hits = 1;
            Memory.safeCache.misses = 1;
        }
        if(Memory.safeCache[key]){
            Memory.safeCache[key].refTime = Game.time;
            Memory.safeCache.hits++;
            return JSON.parse(Memory.safeCache[key].route);
        }
        Memory.safeCache.misses++;

        route = Game.map.findRoute
                ( fromRoomName
                , toRoomName
                , { routeCallback: roomEvalCallback }
                );
        if(route == ERR_NO_PATH)
            return ERR_NO_PATH;

        let safeRoute = [];
        safeRoute.push(fromRoomName);
        for(let ri=0; ri<route.length; ri++)
            safeRoute.push(route[ri].room);
        Memory.safeCache[key] = { route: JSON.stringify(safeRoute), refTime: Game.time };
        return safeRoute;
    }

    static flushStaleRoutes()
    {
        let flushed = 0;
        let preserved = 0;

        if(Math.floor(Math.random()*10) == 0){
            //console.log('Before.. '+Object.keys(Memory.safeCache).length);
            for(let key in Memory.safeCache){
                if(!Memory.safeCache[key].refTime)
                    continue;
                if((Game.time - Memory.safeCache[key].refTime) > 100){
                    flushed++;
                    delete Memory.safeCache[key];
                }
                else
                    preserved++;
            }
        }
        if(false && flushed > 0){
            console.log('T='+Game.time+' Flushed '+flushed+' safeRoute cache entries');
            console.log('... preserved '+preserved);
            console.log('... left = '+Object.keys(Memory.safeCache).length);
        }
    }

    // Returns the cost of the most 'expensive/dangerous' room on a route
    // returned by 'getSafeRoute' -- ignoring starting and final rooms.
    static getSafeRouteDanger( route )
    {
        let max = 0;
        let ri;

        for(ri=1; ri<(route.length-1); ri++){
            let score = this.scoreRoom(route[ri]);
            if(score > max)
                max = score;
        }
        return max;
    }

};

module.exports = PathMaker;
