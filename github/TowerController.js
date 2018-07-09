
class TowerController
{
    static findBestTarget(rObj, towers, hostiles)
    {
        let friendlies = rObj.getFriendlies();
        let bestFCloseCount = 0;
        let bestHCreep;
        
        let walls = rObj.getRampartsWalls();
        for(let hi=0; hi<hostiles.length; hi++){
            let hCreep = hostiles[hi];
            let wallDist;
            
            let wall = hCreep.pos.findClosestByRange(walls);
            //if(wall)
            //    console.log('Found wall '+wall+' pos='+wall.pos);
            if(!wall)
                wallDist = 0;
            else
                wallDist = wall.pos.getRangeTo(hCreep);
            
            let fCloseCount = 0;
            for(let fi=0; fi<friendlies.length; fi++){
                if(friendlies[fi].pos.getRangeTo(hCreep) <= 3)
                    fCloseCount++;
            }
            
            //console.log('Consider '+hCreep+' close='+fCloseCount+' dist='+wallDist);
            
            // Don't both firing on hostiles unless they are close to
            // walls and thus turrets for maximum damage, or they are
            // getting supported by nearby friendly creeps.
            if(fCloseCount == 0 && wallDist > 2)
                continue;
            
            if(!bestHCreep || fCloseCount > bestFCloseCount){
                bestHCreep = hCreep;
                bestFCloseCount = fCloseCount;
            }
            //console.log('Best now'+bestHCreep);
        }
        //console.log('returning '+bestHCreep);
        return bestHCreep;
    }
    
    static towerRun(rObj, towers, hostiles, wounded)
    {
        // Our basic approach with towers is
        //
        //   1) Don't be afraid to be memory hungry.  I'd rather survive and
        //      use cycles and cleanup later.
        //
        //   2) Don't fire til you see the whites of their eyes.
        //      Specifically, when they are in 6 <= x,y <= 43
        //      (Or within a certain distance of spawn if it's offcenter,
        //       or next to walls).
        //
        //   3) Pick the healer if there is one.  If you can't
        //      whack the healer, you probably can't whack anything.
        
        //   4) Once you engage, lock on for at least 8 turns,
        //      or til they leave.
        
        //    Otherwise, we risk room bounce.  With 8T we stand
        // a burning chance of getting them.   Once we lock on,
        // blast them for 8 turns.

        // Rebuild an array of close hostiles.
        let healed = false;
        if(wounded.length > 0){
            //console.log(rObj.m_room.name+' towers healing ');
            for (let ti=0; ti<towers.length; ti++){
                let wCreep = wounded[ti%wounded.length];
                if( (hostiles.length == 0 || ( wCreep.hits < (.90*wCreep.hitsMax)))
                    && towers[ti].energy > 0){
                    towers[ti].heal(wounded[ti%wounded.length]);
                }
            }
        }

        if (!healed && hostiles.length > 0){
            let bestIdx;
            let bestHRng;

            let rmem = rObj.m_rmem;
            let hCreep;
  
            //console.log(rObj.m_room.name+' towers attacking: ');
  
            // If we had a target last turn, see if it is still damaged.
            // If it hasn't managed to heal completely, keep pounding it
            if(rmem.lastTowerTargetId)
                hCreep = Game.getObjectById(rmem.lastTowerTargetId);
            if(hCreep){
                let hCreep = Game.getObjectById(rmem.lastTowerTargetId);
                if(hCreep.hits == hCreep.hitsMax){
                    //console.log('   ... retargetting, creep healed '+hCreep);
                    delete rmem.lastTowerTargetId;
                    hCreep = null;
                }
                else {
                    //console.log('   ... continuing fire on creep '+hCreep+' owner='+hCreep.owner.username+' hits='+hCreep.hits+' hitsMax='+hCreep.hitsMax);

                    for( let ti=0; ti<towers.length; ti++)
                        towers[ti].attack(hCreep);
                }
            }
            if(!hCreep){
                if(rmem.lastTowerTargetId){
                    //console.log('   ... Clearing previous target - dead.');
                    delete rmem.lastTowerTargetId;
                }    
                hCreep = this.findBestTarget(rObj, towers, hostiles);
                if(hCreep){
                    //console.log('   ... Targetting creep '+hCreep+' owner='+hCreep.owner.username);
                    //console.log(rObj.m_room.name+'   ... Firing...');
                    rmem.lastTowerTargetId = hCreep.id;
                    for (let ti=0; ti<towers.length; ti++){
                        if(towers[ti].energy > 0)                    
                            towers[ti].attack(hCreep);
                    }
                }
            }
        }
    }
};

module.exports = TowerController;
