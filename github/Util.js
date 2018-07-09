var RoomObj         = require('RoomObj');
var RoomHolder      = require('RoomHolder');
var Util = {

    inRange: function(x,y,pos,dist)
    {
        return( Math.abs(pos.x - x) <= dist 
                && Math.abs(pos.y - y) <= dist
              );
    },


    testNuker()
    {
        /// DISABLED
        return;
        
        //let tgt  = new RoomPosition(35,12,'W14N21');   //-- Terminal 3+
        let tgt  = new RoomPosition(39,5,'W14N21');   //-- Storage 3+
        //let tgt  = new RoomPosition(31,9,'W14N21');   //- outer spawn, needs 3

        Memory.nukeDesired = 15;
        //Memory.nukeDelivered = 1;
        
        if(Memory.nukeDelivered >= Memory.nukeDesired)
            return;
        
        for(let rName in Game.rooms){
            let rObj = RoomHolder.get(rName);
            let nuk = rObj.getNuker();      
            if(nuk && tgt){
                console.log('Will launch from '+rObj.m_room.name);
                rc = nuk.launchNuke(tgt);
                console.log('... rc='+rc);
                if(rc == 0){
                    // Only deliver one per turn
                    Memory.nukeDelivered++;
                    return;
                }
            }
        }

    },

    testPathFinder()
    {
        // Some code for pathfinder debugging... unfortunatel demonstrates
        // that the swamp costing really breaks pathfinder..
        console.log('Test pathfinder:');
        let origin= new RoomPosition(25,25,'E80S92');
        let dest  = new RoomPosition(25,25,'E77S92');
        
        let pfresult = PathFinder.search
            ( origin
            , { pos: dest, range: 25 }
            , {
                plainCost: 2,
                swampCost: 5,
                maxCost: 300000,
                 
                 roomCallback: function(roomName){
                    if(   roomName == 'E78S98'
                       || roomName == 'E78S97'
                       || roomName == 'E78S96'
                       || roomName == 'E78S95'
                       || roomName == 'E79S95'
                       || roomName == 'E80S95'
                       || roomName == 'E80S94'
                       || roomName == 'E80S93'
                       || roomName == 'E80S92'
                       || roomName == 'E79S92'
                       || roomName == 'E78S92'
                       || roomName == 'E77S92'
                       ) {
    
                        
                        let matrix = new PathFinder.CostMatrix();
                        let room = Game.rooms[roomName];
                        
                        if(!room){
                            console.log('.... '+roomName+'.. blank');
                            return matrix;
                        }
                        
                        if (false) {
                            // Mark off exits unless we know they are really valid
                            for(x=0;x<=49;x++){
                                matrix.set(x,0,255);
                                matrix.set(x,49,255);
                                matrix.set(0,x,255);
                                matrix.set(49,x,255);
                            }
                            
                            // Find the valid exits.
                            let exa = room.find(FIND_EXIT);
                            for(let ei=0; ei<exa.length;ei++){
                                //if(room.name == 'E76S97')
                                 //   console.log('.... x='+exa[ei].x+' y='+exa[ei].y+' room='+exa[ei].roomName);
                                //if(exa[ei].x==0 || exa[ei].y==49)
                                //if(room.name == 'E76S97')
                                    matrix.set(exa[ei].x,exa[ei].y,1);   
                            }
                        }
                        console.log('.... '+roomName+'.. blank');
                        return matrix;
                    }
                    console.log('.... '+roomName+'.. false');
                    return false;
                 }
              }
            );
        console.log('.. Result='+pfresult.path.length);
        console.log('.. Incomplete='+pfresult.incomplete)
        let lastRoom;
        for(let i=0; i<pfresult.path.length; i++){
            if(!lastRoom || pfresult.path[i].roomName != lastRoom){
                lastRoom = pfresult.path[i].roomName;
                console.log('... pfr['+i+']='+pfresult.path[i]);
            }
        }
    
    
        
        
        
        
        
        
    }



};

module.exports = Util;

