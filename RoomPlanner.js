var RoomHolder      = require('RoomHolder');

var g_tmpWorkingRobj;

class RoomPlanner
{

    static checkPlaceStructure(room, rObj, x, y, structureType)
    {

        if(x <=1 || x >= 48 || y <=1 || y >= 48 ){
            
            // Roads are OK next to exit, nothing else.
            if( ! ( structureType == STRUCTURE_ROAD
                     && x <= 49 && x >= 1
                     && y <= 49 && y >= 1
                   )
              )
                return false;
        }
        let res = room.lookAt(x, y);

        for(let ri=0; ri<res.length; ri++){
            let riE = res[ri];
            if(riE.type == 'terrain' && riE.terrain != 'swamp' && riE.terrain != 'plain'){
                if(structureType != STRUCTURE_EXTRACTOR)
                    return false;
            }
            if(riE.type == 'structure'){
                if(riE.structure.structureType == structureType)
                    return false;
                if(riE.structure.structureType == STRUCTURE_WALL)
                    return false;
                if(riE.structure.structureType == STRUCTURE_CONTROLLER)
                    return false;
                if(riE.structure.structureType == STRUCTURE_RAMPART)
                    continue;
                if(riE.structure.structureType == STRUCTURE_ROAD && structureType == STRUCTURE_CONTAINER)
                    continue;
                if(riE.structure.structureType == STRUCTURE_CONTAINER && structureType == STRUCTURE_ROAD)
                    continue;
                
                // in other cases where we're placing over a road return false.  There are a few situations
                // where we might need to manually place roads because of the room structure, or it's possible
                // we're placing towers outside the inner 'quad' and this is a road to a source or controller.
                if(riE.structure.structureType == STRUCTURE_ROAD
                   && structureType != STRUCTURE_TERMINAL
                   && structureType != STRUCTURE_STORAGE
                   && structureType != STRUCTURE_SPAWN
                   )
                    return false;
                
                console.log('Found mismatch structure: '+riE.structure.structureType+' placing '+structureType);
                console.log('DESTROYING!!! at'+room.name+' x='+x+' y='+y);
                riE.structure.destroy();
                return true;
            }
            if(riE.type == 'constructionSite')
                return true;
        }
        
        // When placing extensions, make sure there are roads adjacent, or else extension is blocked by terrain.
        // (except before L4, when we haven't necessarily placed roads yet).
        if(structureType == STRUCTURE_EXTENSION && room.controller.level >= 4){
            let structs = room.lookForAtArea(LOOK_STRUCTURES, y-1, x-1, y+1, x+1, true);
            let si;
            for(si=0; si<structs.length; si++){
                if(si.x == x && s.y == y)
                    continue;
                if(structs[si].structure.structureType == STRUCTURE_ROAD)
                    break;
            }
            // If we didn't find one, we can't place here, return false.
            if(si == structs.length)
                return false;
        }
        
        let rc = room.createConstructionSite(x,y,structureType);
        console.log('RoomPlanner: ordered create '
                    +structureType+' at room='+room.name+' x='
                    +x+' y='+y+' rc='+rc
                    +' on step'+g_tmpWorkingRobj.m_rmem.lastPlanAction);

        return true;
    }
    
        
    // Helper invoked when considering to place structures, to check if
    // the coordinate is close to ( i.e. within 2 dist of) a source, to leave
    // room for roads/creeps to fill off source.
    static checkNearSource(room, rObj, x,y)
    {
        let sources = rObj.getSources();
        
        for(let si=0; si<sources.length; si++){
            let source = sources[si];
            
            if(Math.abs(source.pos.x - x) <= 2
               && Math.abs(source.pos.y-y) <= 2
               ) {
                return true;
            }
        }
        return false;
    }


    // Helper invoked when considering to place structures, to check if
    // the coordinate is close to ( i.e. within 4 dist of) the room controller.
    // We leave 4 to allow lots of dedicon room.
    static checkNearController(room, x,y)
    {
        let controller = room.controller;
        
        if(Math.abs(controller.pos.x - x) <= 4
           && Math.abs(controller.pos.y-y) <= 4
           ) {
            return true;
        }
        return false;
    }
    
    // Helper to planRoom that routes & places roads from a position
    // (sources, controllers, minerals, etc) toward spawn.
    static placeRoadsToSpawn( rObj, fromPos, tlspawn )
    {
        // NOTE! Any changes to this routine should also consider
        // placeControllerContainer which uses the same path finding for
        // placement of controller container (and they need to match).
        
        
        let path;
        let pi;
        path = rObj.m_room.findPath
                (fromPos, tlspawn.pos
                , { ignoreCreeps: true
                  , ignoreRoads : false
                  , maxRooms: 0
                  }
                );

        //console.log(' findPath '+JSON.stringify(fromPos),' to '+JSON.stringify(tlspawn.pos)
        //           +' pathlen='+path.length
        //           );

        for(pi=0; pi<path.length; pi++){
            // Only place roads up to the site diagram (-5 to +6 of tlspawn)
            let pent = path[pi];
            if(    rObj.m_room.name == tlspawn.pos.roomName
                && pent.x >= (tlspawn.pos.x-5)
                && pent.x <= (tlspawn.pos.x+6)
                && pent.y >= (tlspawn.pos.y-5)
                && pent.y <= (tlspawn.pos.y+6)
                ){
                    continue;
            }
            
            if(pent.x == 0 || pent.x == 49 || pent.y == 0 || pent.y == 49)
                continue;
            if(this.checkPlaceStructure(rObj.m_room, rObj, pent.x, pent.y, STRUCTURE_ROAD))
                break;
        }
        if(pi == path.length){
            if(tlspawn.pos.roomName != fromPos.roomName){
                // Now place from corresponding coord in neighbor room to spawn.
                let pent = path[path.length-1];
                let x = pent.x;
                let y = pent.y;
                if(pent.x == 0)
                    x = 49;
                else if(pent.x == 49)
                    x = 0;
                else if(pent.y == 0)
                    y = 49;
                else if(pent.y == 49)
                    y = 0;
                else {
                    console.log('Hmm couldnt determine path to spawn'+pent);
                }
                let nfPos = new RoomPosition(x,y,tlspawn.pos.roomName);
                let nfrObj = RoomHolder.get(tlspawn.pos.roomName);
                return this.placeRoadsToSpawn( nfrObj, nfPos, tlspawn);
            }
            return false;
        }
        return true;
    }
    
    static placeControllerContainer( rObj, containerPos, tlspawn )
    { 
        // Re-generate the road path from controller to spawn.
        // We want to find a position with optimal space around it
        // near that road, for most upgrade creeps to fit.
        // (And so, this pathfinding logic should match the road generation by placeRoadsToSpawn)
        let path;
        let pi;
        path = rObj.m_room.findPath
                (containerPos, tlspawn.pos
                , { ignoreCreeps: true
                  , ignoreRoads : false
                  , maxRooms: 0
                  }
                );
        
        // Harvesters can upgrade the controller from a distance of 3 away. 
        // Ideally we place the controller 2 away so upgraders can cluster around it.
        // Containers are walkable, so just place it 2 up on the road. 
        // Probably more optimal might be to try to find adjacent squares and optimize
        // free space.  That's a TBD
        let roadX = path[2].x;
        let roadY = path[2].y;
        let res = this.checkPlaceStructure(rObj.m_room, rObj, roadX, roadY, STRUCTURE_CONTAINER);
        return res;
    }
    
    static planRoom(rObj)
    {
        let room       = rObj.m_room;
        let rmem       = rObj.m_rmem;
 
        g_tmpWorkingRobj = rObj;
 
        if((Game.time%100 == 0) && !rmem.lastPlanT && rmem.lastPlanAction){
            console.log(Game.time+'Room planning '+room.name+' still active last='+rmem.lastPlanAction);
        }

        // If we made a full room scan pass, we probably won't need to
        // for quite a while.   Do it only every 50 turns.
        // TBD maybe we should have a controller upgrade check too...
        // or somehow delete this if one of the upgrader creeps sees its close.
        if(rmem.lastPlanT && (Game.time - rmem.lastPlanT) < 100)
            return;

        // Don't plan someone else' room
        let controller = room.controller;
        if(controller && !controller.my && controller.owner)
            return;

        // And don't plan rooms that don't have a host.
        if( (!controller || (controller && !controller.my)) 
            && !rmem.hostRoom 
          ) {
            delete rmem.lastPlanAction;
            rmem.lastPlanT = Game.time;
            return;
        }

        // Don't plan center rooms (for now anyway)
        if(rObj.isCenterRoom()){
            delete rmem.lastPlanAction;
            rmem.lastPlanT = Game.time;
            return;
        }

        //console.log('T='+Game.time+' Planning room '+room.name+', lastPlanT='+rmem.lastPlanT);

        // Delete any stale last plan, so other activities can know that planning is still in progress.
        // (Unless of course we set it again before we exit this function).
        delete rmem.lastPlanT;

        // Planner only places one site at a time to prioritize work.
        let sites      = rObj.getSites();
        rmem.lastPlanAction='CheckExistingSites';

        if(sites.length != 0)
            return;
        
        // console.log('Planner T='+Game.time+' room='+room.name+' last='+rmem.lastPlanT);
        
        // A graphic probably explains this algorithm the best.
        //                T............T
        //                ..EEEE..EEEE..
        //                .E.EEE..EEE.E.
        //                .EE.EE..EE.EE.
        //                .EEE......EEE.
        //                .EEE.,..,.EEE.
        //                ......SS.l....
        //                ......ScL.....
        //                .EEE.,..,tEEE.
        //                .EEE......EEE.
        //                .EE.EE..EE.EE.
        //                .E.EEE..EEE.E.
        //                ..EEEE..EEEE..
        //                T............T
        //
        // . = road
        // , = road (quadrant corner)
        // c = storage, or container
        // S = spawns
        // t = terminal
        // l = link (to controller link)
        // L = linker creep position.
        // T = turrets
        // E = extensions
        
        // The diagram itself shows 72 extensions.  Enough for an
        // L8 room's limit of 60. 
        // That said, not all rooms will fit this, and those that do probably
        // have very little natural wall protection.
        // 
        // TBD to extend the algorithm outside these borders ;-)
        // However, it's likely I'll just take advantage of controller &
        // source roads, and place along them at a distance so not to obstruct
        // traffic.

        let extenList  = rObj.getExtensions();
        let tlspawn = rObj.findTopLeftSpawn();
        
        // For rooms that aren't self-booting, clear any structures in the room that exist
        // and aren't ours.  They are likely left from previous owner and don't follow our plan.
        // (Preserve storage and terminals though unless they be empty)
        if(controller && controller.my && tlspawn && controller.level < 3 && !rmem.selfBooting && !rmem.haveCleared){
            let allStruct = rObj.getAllStructures();
            for(let i=0; i<allStruct.length; i++){
                let st = allStruct[i];
                if(st.structureType != STRUCTURE_SPAWN 
                   && st.structureType != STRUCTURE_CONTROLLER
                   && (st.structureType != STRUCTURE_STORAGE || _.sum(st.store) == 0)
                   && (st.structureType != STRUCTURE_TERMINAL || _.sum(st.store) == 0)
                   && (st.structureType != STRUCTURE_CONTAINER || _.sum(st.store) == 0)
                   ){
                    console.log('Destroying old site '+st);
                    st.destroy();
                }
            }
            rmem.haveCleared = true;
        }
        if(rmem.haveCleared && controller && controller.level >= 5)
            delete rmem.haveCleared;
        
        
        if(controller && controller.my && tlspawn){
            rmem.lastPlanAction='Place spawn group items';
            // Place spawn group containers/storage/terminals.
            let nRooms = Object.keys(Game.spawns).length;
            if( controller.level < 4 && nRooms > 1 && !rmem.selfBooting
               && this.checkPlaceStructure(room, rObj, tlspawn.pos.x, tlspawn.pos.y+1, STRUCTURE_CONTAINER))
                return;
            
            if(room.storage && !room.storage.my){
                if(_.sum(room.storage) == 0){
                    room.storage.destroy();
                    return;
                }
            }
            else if(controller.level >= 4
               && this.checkPlaceStructure(room, rObj, tlspawn.pos.x+1, tlspawn.pos.y+1, STRUCTURE_STORAGE))
                return;
            if(controller.level >= 6
               && this.checkPlaceStructure(room, rObj, tlspawn.pos.x+3, tlspawn.pos.y+2, STRUCTURE_TERMINAL))
               return;
        }
        
        // Place extensions if we are below limit for controller.
        if(controller && controller.my && tlspawn && extenList.length 
           < CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][controller.level]
           ){

            rmem.lastPlanAction='Place extensions';

            // To simplify the logic we do this in quadrants,
            // with x/y multipliers of -1,1.
            
            // The quadrant's corner is where the 'T' is on the diagram.

            // Search in outward squares, starting at distance 2 from the
            // quadrant corners (where extensions begin).  
            for(let dist=2; dist<=4; dist++){
                // Loop through quadrants
                for(let xm=1; xm >=-1; xm-=2 ){
                    for(let ym=1; ym >=-1; ym-=2 ){
                        // Get quadrant corner position.
                        let qCornerX = tlspawn.pos.x;
                        let qCornerY = tlspawn.pos.y;
                        qCornerX += (xm > 0) ? 2 : -1;
                        qCornerY += (ym > 0) ? 2 : -1;
                        
                        // Then iterate through positions at distance 'dist'
                        // from the corner.
                        
                        // Place extensions along the X axis of quadrant edge
                        for(let dx=0; dx<dist; dx++){
                            let candidateX = qCornerX+dx*xm;
                            let candidateY = qCornerY+dist*ym;
                            
                            if(this.checkNearSource(room, rObj, candidateX, candidateY))
                                continue;
                            if(this.checkNearController(room, candidateX, candidateY))
                                continue;
                            if(this.checkPlaceStructure(room, rObj, candidateX, candidateY, STRUCTURE_EXTENSION))
                                return;
                        }
                        
                        // And then the Y.
                        for(let dy=0; dy<dist; dy++){
                            let candidateX = qCornerX+dist*xm;
                            let candidateY = qCornerY+dy*ym;
                            if(this.checkNearSource(room, rObj, candidateX, candidateY))
                                continue;
                            if(this.checkNearController(room, candidateX, candidateY))
                                continue;                            
                            if(this.checkPlaceStructure(room, rObj, candidateX, candidateY, STRUCTURE_EXTENSION))
                                return;
                        } 
                    }
                }
            }
        }

        // Place roads, but only once controller has reached L3 and all extensions
        // are built.  (The extensions code above will have returned if not all are built so
        // we shouldn't get here)
        if(controller && controller.my && controller.level < 3) {
            //console.log('...Plan complete T='+Game.time);
            delete rmem.lastPlanAction;
            rmem.lastPlanT = Game.time;
            return;
        }
        else if(!controller || (!controller.my && !controller.owner)){
            if(!rmem.hostRoom){
                delete rmem.lastPlanAction;
                rmem.lastPlanT = Game.time;
                return;
            }

            let hrObj = RoomHolder.get(rmem.hostRoom);
            let hrTlspawn = hrObj.findTopLeftSpawn();
            
            // Don't harvest keeper rooms til we have spawn power to support it
            // at L7.
            if(rmem.keeperRoom && hrObj.m_room.controller.level < 7){
                delete rmem.lastPlanAction;
                rmem.lastPlanT = Game.time;
                return;
            }
            
            // Neighbor remote harvesting.  Setup source roads back to home.
            let sources = rObj.getSources();
            
            rmem.lastPlanAction='Place harvest roads for '+rObj.m_room.name+' to spawn in '+hrObj.m_room.name;
            for(let si=0; si<sources.length; si++){
                let hp = rObj.getDediHarvestPosition(hrObj, sources[si]);
                if(!hp)
                    return;
                let hpPos = new RoomPosition(hp.x,hp.y,rObj.m_room.name);
                
                if(this.placeRoadsToSpawn(rObj,hpPos, hrTlspawn))
                    return;
            }
            
            
            
            // Place extractor, mineral mining container and roads back to spawn from mine.
            let mineral;
            if(rObj.getLairs().length > 0 && hrObj.m_room.controller.level >= 7){
                rmem.lastPlanAction='Place mineral structures';
                let mineral = rObj.getMineral();
                if (mineral && ! (rObj.getExtractor())
                    && this.checkPlaceStructure(room, rObj, mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR)
                   )
                    return;
                let container = rObj.getMineralHarvestContainer(hrObj);
                if(!container){
                    let mhp = rObj.getMineralHarvestPos(hrObj);    
                    if(!mhp){
                        console.log('BARF1 room planner! hrObj='+hrObj.m_room.name);
                        return;
                    }
                    this.checkPlaceStructure(room, rObj, mhp.x, mhp.y, STRUCTURE_CONTAINER);
                    return;
                }
                if(this.placeRoadsToSpawn(rObj,container.pos, hrTlspawn))
                    return;
            }
            delete rmem.lastPlanAction;
            rmem.lastPlanT = Game.time;
            //console.log('...Plan complete T='+Game.time);

            return;
        }
        else {
               
            // Place paths to sources
            rmem.lastPlanAction = 'Place roads sources to spawn';
            let sources = rObj.getSources();
            for(let si=0; si<sources.length; si++){
                let hp = rObj.getDediHarvestPosition(rObj, sources[si]);
                if(!hp)
                    return;
                let hpPos = new RoomPosition(hp.x,hp.y,rObj.m_room.name);
                if(this.placeRoadsToSpawn(rObj,hpPos, tlspawn))
                    return;
            }

            // First place the horizontal double roads outward from spawn groups.
            rmem.lastPlanAction = 'Place spawn horizontal roads';
            for(let dx=-6; dx<=7; dx++){
                for(let dy=0; dy<=1; dy++){
                    if(dx>=0 && dx<=1)
                        continue;
                    if(this.checkPlaceStructure(room, rObj, tlspawn.pos.x+dx, tlspawn.pos.y+dy, STRUCTURE_ROAD))
                        return;
                }
            }
            
            // Place the vertical double roads outward from spawn groups.
            rmem.lastPlanAction = 'Place spawn vertical roads';
            for(let dy=-6; dy<=7; dy++){
                for(let dx=0; dx<=1; dx++){
                    if(dy>=0 && dy<=1)
                        continue;
                    if(this.checkPlaceStructure(room, rObj, tlspawn.pos.x+dx, tlspawn.pos.y+dy, STRUCTURE_ROAD))
                        return;
                }
            }
            
            // Place the quadrant roads -- the diagonals outward and the pocket at base of each quadrant.
            // Loop through quadrants
            rmem.lastPlanAction='Place quadrant roads';
            let towers = rObj.getTowers();
            for(let xm=1; xm >=-1; xm-=2 ){
                for(let ym=1; ym >=-1; ym-=2 ){
                    
                    // Get quadrant corner position.
                    let qCornerX = tlspawn.pos.x;
                    let qCornerY = tlspawn.pos.y;
                    qCornerX += (xm > 0) ? 2 : -1;
                    qCornerY += (ym > 0) ? 2 : -1;
                    
                    // Place diagonals
                    for(let dist=1; dist <= 4; dist++){
                        if(this.checkPlaceStructure(room, rObj, qCornerX+dist*xm, qCornerY+dist*ym, STRUCTURE_ROAD))
                            return;
                    }
                    
                    // And roads in the quadrant corner
                    // TBD.. probably need a hole for terminal?
                    for( let dx=0; dx<=1; dx++){
                        for( let dy=0; dy<=1; dy++){
                            let qcx = qCornerX+dx*xm;
                            let qcy = qCornerY+dy*ym;
                            
                            // Skip road where terminal belongs.
                            if(controller.level >= 6 && qcx == tlspawn.pos.x+3 && qcy == tlspawn.pos.y+2)
                                continue;
                             
                            if(this.checkPlaceStructure(room, rObj, qcx, qcy, STRUCTURE_ROAD))
                                return;
                        }
                    }
                    
                    // And turret at end of diagonal, if room level permits.

                    if(CONTROLLER_STRUCTURES[STRUCTURE_TOWER][controller.level] > towers.length){
                        if(this.checkPlaceStructure(room, rObj, qCornerX+5*xm, qCornerY+5*ym, STRUCTURE_TOWER))
                            return;
                    }
                }
            }
            
            // Place paths to controller.
            rmem.lastPlanAction='Place controller roads';
            if(this.placeRoadsToSpawn(rObj, controller.pos, tlspawn))
                return;
            
            // Place a container near controller, along road.
            rmem.lastPlanAction='Place controller container';
            if(!rObj.getControllerContainer()
               && this.placeControllerContainer(rObj, controller.pos, tlspawn))
                return;

            // Place extractor, mineral mining container and roads back to spawn from mine.
            let mineral;
            if(controller.level >= 6){
                rmem.lastPlanAction='Place mineral structures';
                let mineral = rObj.getMineral();
                if (mineral && ! (rObj.getExtractor())
                    && this.checkPlaceStructure(room, rObj, mineral.pos.x, mineral.pos.y, STRUCTURE_EXTRACTOR)
                   )
                    return;
                let container = rObj.getMineralHarvestContainer();
                if(!container){
                    let mhp = rObj.getMineralHarvestPos();    
                    this.checkPlaceStructure(room, rObj, mhp.x, mhp.y, STRUCTURE_CONTAINER);
                    return;
                }
                if(this.placeRoadsToSpawn(rObj,container.pos, tlspawn))
                    return;
            }

            rmem.lastPlanAction='Place second spawn';
            
            // At L7 place 2nd spawn, right of first.
            if(controller.level >= 7
                && this.checkPlaceStructure(room, rObj, tlspawn.pos.x+1, tlspawn.pos.y, STRUCTURE_SPAWN))
                return;
            
            // At L8 place 3nd spawn, below first.  This might replace the original container if it 
            // was never removed - so be it.
            if(controller.level >= 8
                && this.checkPlaceStructure(room, rObj, tlspawn.pos.x, tlspawn.pos.y+1, STRUCTURE_SPAWN))
                return;                 
            
            // TBD... next would be to place outer walkways. But I'm not certain I really want those walkways rather than
            // walls, and I need to consider how I extend this outward if it doesn't all fit.
            
            //console.log('...Plan complete T='+Game.time);
            delete rmem.lastPlanAction;
            rmem.lastPlanT = Game.time;
            return;
        }
    }
}

module.exports = RoomPlanner;
