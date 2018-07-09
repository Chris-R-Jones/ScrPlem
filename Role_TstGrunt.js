
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// So far, at least, this is a boosted creep only, and tuned accordingly.
const BODY_M1 = [ TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
                , TOUGH, TOUGH, TOUGH, TOUGH, TOUGH
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , ATTACK, ATTACK, ATTACK, ATTACK, ATTACK
                , MOVE, MOVE, MOVE, MOVE, MOVE
                , MOVE, MOVE, MOVE, MOVE, MOVE
                ];
//   10x10 = 100 TOUGH
// + 30x80 = 2400 ATTACK
// + 10x50  = 500 MOVE
// = 3000
const BODY_M1_COST = 3000;

class Role_TstGrunt extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };
    
    static spawn( spawn, hrObj, targetRoomName, max ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let controller   = hRoom.controller;
        let cost         = BODY_M1_COST;
        let body         = BODY_M1;
        
        if(hRoom.energyAvailable < cost)
            return true;
        
        // Find a free name and spawn the bot.
        let altTime = 200;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'tstGrunt', body, max, altTime, multispec, targetRoomName);
        
        // If null, we hit max creeps.
        if(crname == null)
            return false;
        
        let crmem  = Memory.creeps[crname];
        crmem.state     = 'init';
        crmem.tRoomName  = targetRoomName;
        delete crmem.instance;
        return true;
    };


    
    // Helper to find lab to boost a certain body part for this creep
    findLabForBoost(crObj, part)
    {
        let boost;
        switch(part){
        case MOVE:
            boost = 'XZHO2';
            break;
        case TOUGH:
            boost = 'XGHO2';
            break;
        case ATTACK:
            boost = 'XUH2O';
            break;
        default:
            return null;
        }

        let labs = crObj.getLabs();
        for(let li=0; li<labs.length; li++){
            let lab = labs[li];
            if(   (lab.mineralType == boost)
               && (lab.mineralAmount >= 900)
               && (lab.energy >= 600)
               )
               return lab;
        }
        
        return null;
    }

    
    
    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let cRoom  = creep.room;
	    let crObj  = RoomHolder.get(cRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let structs;
	    let closest;
	    let debug="";
	    let bix;
        let friendlies;
        let frCr;
	    
	    //if(creep.name == 'tstGrunt_W4N31_W2N42_0_alt'){
    	//    crmem.tRoomName = 'W3N39';
    	//    crmem.prevRoom = 'W3N40';
	    //}
        let tRoomName = crmem.tRoomName;

        // Attack logic is independent of move logic.  We'll just attack
        // whatever is closest.  (Should probably refine that later).
        let hostiles = crObj.getHostiles();
        let hCreep = creep.pos.findClosestByPath(hostiles);
        if(!hCreep && hostiles.length)
            hCreep = creep.pos.findClosestByRange(hostiles);


        let hRange;
        if(hCreep)
            hRange = hCreep.pos.getRangeTo(creep.pos);
        //console.log('Selected hCreep='+hCreep+' range='+hRange);
        if(hCreep && hRange <= 1){
            creep.attack(hCreep);
            //console.log('Attack hcreep rc='+rc+' creep='+hCreep);
        }
        
        
        let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(cRoom.name);
        let fMod = parsed[1] % 10;
        let sMod = parsed[2] % 10;
        let isHW = (fMod === 0 || sMod === 0);
        
        
        let allStruct;
        
        if(!isHW)
            allStruct = crObj.getAllStructures();
        let hStruct;
        if( (!hCreep || hRange > 3) 
            && allStruct
            && ( ( creep.room.name == tRoomName && (!creep.room.controller || !creep.room.controller.my))
                 || ( crObj.m_rmem.owner == "nouser" && !(crObj.m_rmem.hostRoom))
               )
             ){

            hStruct = creep.pos.findClosestByRange
                        (allStruct
                        , {  filter: function(st) 
                            { return st.structureType != STRUCTURE_CONTROLLER; 
                            } 
                          }
                        );
            let rc1, rc2;
            if(hStruct)
                hRange = creep.pos.getRangeTo(hStruct);
            if(hStruct && hRange <= 1){
                rc2 = creep.attack(hStruct);
                //console.log('Attack hcreep rc='+rc+' creep='+hCreep);
            }   
            //if(creep.name == 'tstGrunt_W2N26_E1N23_1')
            //  console.log('hStruct found = '+hStruct+ 'rc1='+rc1+' rc2='+rc2);
            
        }

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';
            
            //if(creep.name == 'tstGrunt_E4N47_E9N48_1')
            //    console.log(Game.time+' '+creep.name+' state='+crmem.state+' pos='+creep.pos);
            
            switch(crmem.state){

            case 'init':
                crmem.state = 'checkBoosts';
                return;

            case 'checkBoosts':
            
                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].boost)
                        continue;
                    if(!this.findLabForBoost(crObj,creep.body[bix].type)){
                        console.log('Missing boost for '+creep.body[bix].type);
                        crmem.state = 'moveReclaim';
                        break;
                    }
                }
                crmem.state = 'applyBoosts';
                
                return;

            case 'applyBoosts':

                for(bix=0; bix<creep.body.length; bix++){
                    if(creep.body[bix].boost)
                        continue;
                    let lab = this.findLabForBoost(crObj,creep.body[bix].type);
                    if(!lab){
                        console.log('Missing boost for '+creep.body[bix].type+' in apply!!');
                        break;
                    }
                    if(creep.pos.getRangeTo(lab)>1)
                        this.actMoveTo(lab);
                    lab.boostCreep(creep);
                    return;
                }
                crmem.state = 'moveTgtRoom';
                
                break;


            case 'homeRoom':
                // When in home room, there's no point moving to target
                // if home room is also under attack.  If there are
                // targets, find and engage.
                if(hCreep)
                    crmem.state = 'engageTargets';
                else if(creep.hits < creep.hitsMax)
                    // Lurk here til we get some healing (towers hopefully)
                    return;
                else
                    crmem.state = 'moveTgtRoom';
                break;
                
            case 'moveHome':
                if(creep.hits == creep.hitsMax){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                if(rc == OK) {
                    crmem.state = 'homeRoom'
                    break;
                }
                return;

            case 'moveTgtRoom':
                // When moving to target room, determine the room we entered it from,
                // for retreat.
                if(creep.room.name != tRoomName)
                    crmem.prevRoom = creep.room.name;

                rc = this.actionMoveToRoomRouted(tRoomName);
                if(rc == OK) {
                    crmem.state = 'hostileArrival'
                    break;
                }
                return;

            case 'hostileArrival':
                // Reset hostile room arrival time, then linger at arrival.
                crmem.arrivalT = Game.time;
                crmem.state = 'lingerTgtRoom';
                break;
            
            case 'lingerTgtRoom':
                
                if(creep.room.name != tRoomName){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                
                if(creep.name == 'tstGrunt_E4N47_E9N48_1')
                   console.log('got here pos='+creep.pos);       
                
                // If there are hostiles, start getting to work.
                if(   ( !cRoom.memory.hostileTowerCt || 
                        ( Game.time - crmem.arrivalT) > 15
                      )
                   && ( hCreep || ( creep.room.name == 'tRoomName' && allStruct.length ))
                   ){
                    crmem.state = 'engageTargets';
                    break;
                }
                
                // If not, and we're wounded, move back to staging where we can
                // get healing.
                if(creep.hits < (.90*creep.hitsMax)){
                    crmem.state = 'moveStaging';
                    break;
                }

                // If we got here, we're just idling, try to find a friendly 
                // tstDecon to guard, and decon its nearest
                friendlies = crObj.getFriendlies();
                frCr = null;
                for(let fi=0; fi<friendlies.length; fi++){
                    if(!friendlies[fi] || !friendlies[fi].memory){
                        continue;
                    }
                    if(friendlies[fi].id == creep.id){
                        continue;
                    }
                    if(friendlies[fi].memory.role == 'tstDecon'){
                        frCr = friendlies[fi];
                        break;
                    }
                }
                if(frCr){
                    this.actMoveTo(frCr);   
                    return;
                }
                return;

            case 'moveStaging':
                if(!crmem.prevRoom)
                    crmem.prevRoom = crmem.homeName;
                rc = this.actionMoveToRoom(crmem.prevRoom);
                if(rc == OK)
                    crmem.state = 'stagingRoom';
                return;

            case 'stagingRoom':
                // If there are targets, start getting to work.
                if(hCreep){
                    crmem.state = 'engageTargets';
                    break;
                }                
                if(creep.hits < .60 * creep.hitsMax){
                    let tlsp;
                    tlsp = crObj.findTopLeftSpawn();
                    if(tlsp){
                        this.actMoveTo(tlsp);
                        return
                    }
                    else{
                        crmem.state = 'moveHome';
                        break;
                    }
                }
                if(creep.hits == creep.hitsMax)
                    crmem.state = 'moveTgtRoom';
                
                // If there's room, move out of  arrivals.
                if(creep.pos.x==1)
                    creep.move(RIGHT);
                else if(creep.pos.x>46){
                    switch(Math.floor((Math.random() * 3))){
                    case 0: creep.move(BOTTOM_LEFT); break;
                    case 1: creep.move(TOP_LEFT); break;
                    case 2: creep.move(LEFT); break;
                    }
                }
                else if(creep.pos.y<3){
                    switch(Math.floor((Math.random() * 3))){
                    case 0: creep.move(BOTTOM); break;
                    case 1: creep.move(BOTTOM_RIGHT); break;
                    case 2: creep.move(BOTTOM_LEFT); break;
                    }
                }
                else if(creep.pos.y==48)
                    creep.move(TOP);        
                return;
            
            case 'engageTargets':
                
                // Creeps enter this state if room has hostiles.   (That
                // isn't necessarily the case still).

                if(creep.room.name != tRoomName 
                   && creep.room.name != crmem.homeName
                   && creep.room.name != crmem.prevRoom
                   ) {
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                
                // Check if still hostile.  If not move back to the room state
                // for room we're in.
                if(!hCreep && (creep.room.name != tRoomName || (allStruct && allStruct.length == 0))){
                    if(creep.room.name == crmem.homeName){
                        crmem.state = 'homeRoom';
                        break;
                    }
                    else if(creep.room.name == tRoomName){
                        crmem.state = 'lingerTgtRoom'; 
                        break;
                    } 
                    else{
                        crmem.state = 'stagingRoom';
                        break;
                    }
                }

                //if(creep.name == 'tstGrunt_E6S7_E4S9_0_alt')
                //    console.log(Game.time+' .. checking safety');

                // Make sure we're reasonably close to a friendly healer. 
                // They 'should' bubble along side us in a mass chaos fashion.
                if(creep.room.name == tRoomName){
                    friendlies = crObj.getFriendlies();
                    frCr = null;
                    let minDist = 99;
                    for(let fi=0; fi<friendlies.length; fi++){
                        if(!friendlies[fi] || !friendlies[fi].memory){
                            continue;
                        }
                        if(friendlies[fi].id == creep.id){
                            continue;
                        }
                        if(friendlies[fi].memory.role == 'tstHeal'){
                            let dist = friendlies[fi].pos.getRangeTo(creep);
                            if(dist < minDist){
                                frCr = friendlies[fi];
                                minDist = dist;
                            }
                            frCr = friendlies[fi];
                        }
                    }
                    if(frCr && creep.hits < creep.hitsMax && minDist >= 2){
                        this.actMoveTo(frCr);
                        return;
                    }
                    else if(frCr && minDist >= 3){
                        this.actMoveTo(frCr);   
                        return;
                    }
                    else if(!frCr){
                        if(creep.hits < creep.hitsMax){
                            crmem.state = 'moveStaging';
                        }
                        return;
                    }
                }
 
                //if(creep.name == 'tstGrunt_E6S7_E4S9_0_alt')
                //    console.log(Game.time+' .. Safe OK');
  
                // Override manual targets.
                let tgtw=Game.getObjectById('5a4829a53fd4fd632c7080f4');
                if(!tgtw){
                    tgtw=Game.getObjectById('59dc2b8ef312652d48275cc7');
                }
                if(tgtw){
                    this.actMoveTo(tgtw,{ ignoreDestructibleStructures: true, maxRooms: 1 });
                    creep.attack(tgtw);
                    return;
                }
            
                if( hCreep &&   Math.abs(hCreep.pos.x) != 0
                    && Math.abs(hCreep.pos.x) != 49
                    && Math.abs(hCreep.pos.y) != 0
                    && Math.abs(hCreep.pos.y) != 49
                    ){
                        
                    // (This is pretty brute force, major TBD :)
                    rc = this.actMoveTo(hCreep, { ignoreDestructibleStructures: true, maxRooms: 1 });
                }
                else if( creep.room.name == tRoomName 
                         && creep.room.controller 
                         && !(creep.room.controller.my)
                         && !(crObj.m_rmem.hostRoom)
                    ){

                    //if(creep.name == 'tstGrunt_E6S7_E4S9_0_alt')
                    //    console.log(Game.time+' .. picking target');
                    

                   // hCreep = null;

                    let spawnz = crObj.getSpawns();
                    if(spawnz.length > 0){
                        this.actMoveTo(spawnz[0],{ignoreDestructibleStructures: true, maxRooms: 1 });
                        if(creep.pos.getRangeTo(spawnz[0])<=1)
                            creep.attack(spawnz[0]);
                    }
                    else if(hStruct){
                        this.actMoveTo(hStruct, {maxRooms: 1});
                    }
                    else {
                        let sites = crObj.getSites();
                        if(sites && sites.length > 0)
                            this.actMoveTo(sites[0].pos,  {maxRooms: 1});
                    }
                }
                
                return;
            
            case 'moveReclaim':
                // Head back home to reclaim.  But if we got reassigned to a new division,
                // turn back to new target.
                rc = this.actionMoveToRoomRouted(crmem.homeName);
                if(rc != OK)
                    return;
                let spawns = crObj.getSpawns();
                if(spawns && spawns.length > 0){
                    if(spawns[0].pos.getRangeTo(creep.pos) <= 1){
                        spawns[0].recycleCreep(creep);
                        return;
                    }
                    else
                        this.actMoveTo(spawns[0]);
                }
                return;
              
            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'moveHome';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);   
	}
}

module.exports = Role_TstGrunt;
