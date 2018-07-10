
var g_cpuMajorLastUsed = 0;

class Grafana {

	// Invoked at the start of the main loop to collect initial stats
	// (memory load time)
	static logInitial() {
	    delete Memory.stats;
		if(!Memory.stats)
			Memory.stats = {};
		Memory.stats["cpu.initial"] = g_cpuMajorLastUsed = Game.cpu.getUsed();
		Memory.stats["cpu.limit"]   = Game.cpu.limit;
        Memory.stats["cpu.bucket"]  = Game.cpu.bucket;
	}

	// Invoked at the end of the main loop to collect final stats
	static logFinal() {
		Memory.stats["cpu.final"] = Game.cpu.getUsed();
	}

    static logNCreeps(nCreeps, roleCounts)
    {
        Memory.stats["creeps.count"] = nCreeps;

        for(let role in roleCounts){
            Memory.stats["creeps.role."+role] = roleCounts[role];
        }
    }

	// Invoked to log major CPU tasks.  We keep tracking the start of
	// the last major activity in g_cpuMajorLastUsed, and log in grafana
	// the deltas each time this is called (using the provided caption)
	static logMajorCPU( caption )
	{
		let last = g_cpuMajorLastUsed;
		let now  = Game.cpu.getUsed();
		g_cpuMajorLastUsed = now;

		let section = ('cpu.major.'+caption);
		Memory.stats[section] = (now-last);
	}


	static logRoomStats(rObj)
	{
        let room = rObj.m_room;
	    if(!room)
	        return;
	    if(!room.controller || ! room.controller.my)
	        return;
	    let sto = rObj.getSpawnStorage();
	    let trm = rObj.getTerminal();

	    Memory.stats[ (room.name+"."+"energyAvailable") ] = room.energyAvailable;
	    Memory.stats[ (room.name+'.'+"storage.energy") ] = sto?sto.store.energy:0;
	    Memory.stats[ (room.name+'.'+"walls.minimum") ] = rObj.m_minRampartsWallsHits;
	    for (let ri=0; ri<RESOURCES_ALL.length; ri++){
	        let good = RESOURCES_ALL[ri];

	        let roomTot = 0;

	        if(sto && sto.store[good])
	            roomTot += sto.store[good];
	        if(trm && trm.store[good])
	            roomTot += trm.store[good];

	        let key = "rsctot."+good;
	        if(!Memory.stats[key])
	            Memory.stats[key] = roomTot;
	        else
	            Memory.stats[key] += roomTot;
	    }
	}
};

module.exports = Grafana;
