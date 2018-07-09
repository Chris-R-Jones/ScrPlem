
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');

// Small carry creep that just trickles minerals back from mine to storage
// at roughly the mining rate.
class Role_Minecart extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };  
    
    static spawn( spawn, hrObj, targetRoomName ) {
        let hRoom        = spawn.room;
        let tRoom        = Game.rooms[targetRoomName];
        let trObj        = RoomHolder.get(targetRoomName);
        let controller   = hRoom.controller;
        let si;

        // Get storage or container nearest to spawns, if not built yet 
        // we're not ready/
        let spStorage = hrObj.getSpawnStorage();
        if(!spStorage)
            return false;
        
        if(!trObj || !trObj.m_room)
            return false;
            
        let cont = trObj.getMineralHarvestContainer(hrObj);
        if(!cont || _.sum(cont.store) == 0)
            return false;
            
        // Body will be equal parts CARRY MOVE
        // We want to balance the creep to be able to move resource back at about
        // the rate that the miner generates.
        //    Miners are limited to one unit mined per WORK, every 6 turns.
        // We try to calculate our move rate based on that with distance travelled
        // factored in.  First figure out many WORKs the miner will have at this
        // energy level.
        
        // A miner core is WORK,WORK,MOVE, 250 E.
        let nMiCore = Math.floor(hRoom.energyCapacityAvailable / 250);
        let nMiWork = 2*nMiCore;
        
        // For each mover round trip (2*path length turns plus transfer time), 
        // worker will generate nMiWork every 6 turns.
        let path = hrObj.getDediHarvPath(cont);
        let plen = path.length;
        if(trObj.isCenterRoom())
            plen += 50;
        let mineralsPerRoundtrip = ( nMiWork * ((2*(plen+1)) / 6));
        
        // Make sure we have enough CARRY to satisfy.
        let nCarry = Math.ceil(mineralsPerRoundtrip / 50);
        let nMove  = Math.ceil(nCarry / 2);
        
        if(nCarry > 33){
            nCarry = 33;
            nMove = 17;
        }
        let cost = (nCarry + nMove)*50;
        let maxCreeps = 1;
        let altTime = 0;

        // Wait for it, if not yet available.
        if(cost > hRoom.energyAvailable)
            return true;
        
        // Body build
        let body = [];
        for(let bi=0; bi<nCarry; bi++)
            body.push(CARRY);
        for(let bi=0; bi<nMove; bi++)
            body.push(MOVE);

        // Find a free name and spawn the bot.
        let crname = Creep.spawnCommon(spawn, 'minecart', body, maxCreeps, altTime, "", targetRoomName);
       
        // If null, we hit max creeps.
        if(crname == null)
            return false;
        
        let crmem  = Memory.creeps[crname];
        
        crmem.tRoomName = targetRoomName;
        crmem.state     = 'moveTgtRoom';

        delete crmem.instance
        return true;
    };
    
    
    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let crObj = RoomHolder.get(creep.room.name);
	    let hRoom  = Game.rooms[crmem.homeName];
	    let hrObj  = RoomHolder.get(hRoom.name);
	    let tRoom  = Game.rooms[crmem.tRoomName];
	    let trObj  = RoomHolder.get(crmem.tRoomName);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";

	    // Defence
	    if(this.commonDefence(creep, crObj, hrObj, trObj)){
	        crmem.state = 'moveTgtRoom';
	        this.clearTarget();
	        return;
	    }
	    
	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'minecart_W5N33_W5N35_0')
            //    console.log('T='+Game.time+' '+creep.name+' pos='+creep.pos+' state='+crmem.state+' loop='+exceed);

            switch(crmem.state){ 

            case 'moveTgtRoom':
                rc = this.actionMoveToRoomRouted(crmem.tRoomName);
                if(rc == OK) {
                    crmem.state = 'pickMinContainer';
                    break;
                }
                return;
                
            case 'pickMinContainer':
                let cont = trObj.getMineralHarvestContainer(hrObj);
                if(cont){
                    this.setTarget(cont);
                }
                else {
                    console.log(creep.name+' no mineral harvest container! recycling..');
                    crmem.state = 'recycle';
                    break;
                }
                crmem.state = 'withdrawStruct';
                break;    

            case 'withdrawStruct':
                rc=this.withdrawStruct(null);
                if(rc == ERR_FULL){
                    crmem.state = 'pickFill';
                    break;
                }
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    let mineral = trObj.getMineral();
                    if(_.sum(creep.carry) > 0 )
                        crmem.state = 'pickFill';
                    else if(mineral.mineralAmount == 0)
                        crmem.state = 'recycle';
                    else
                        crmem.state = 'pickMinContainer';
                    return;
                }
                if(rc == ERR_NO_PATH){
                    crmem.state = 'moveTgtRoom';
                    return;
                }
                crmem.state = 'moveTgtRoom';                
                break;

            case 'pickFill':
                let spStorage = hrObj.getSpawnStorage();
                if(!spStorage)
                    return false;
                
                this.setTarget(spStorage);
                crmem.state = 'fillStructure';
                break;

            case 'fillStructure':
                rc=this.fillTarget( null );
                if(rc == OK)
                    return;
                if(rc == ERR_NOT_ENOUGH_RESOURCES){
                    crmem.state = 'moveTgtRoom';
                    break;
                }
                if(creep.carry.energy == 0){
                    crmem.state = 'moveTgtRoom';
                }
                else{
                    crmem.state = 'pickFill';
                }
                break;

            case 'recycle':
                // Head back home to reclaim.
                 rc = this.actionMoveToRoom(crmem.homeName);
                if(rc != OK)
                    return;
                let spawns = hrObj.getSpawns();
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
                crmem.state = 'moveTgtRoom';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' pos='+creep.pos+' exceeded max loops\n'+debug);   
	}
}

module.exports = Role_Minecart;
