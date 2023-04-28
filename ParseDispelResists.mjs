#!/usr/bin/env node
import { argv, exit } from 'node:process'
import { readdir, open } from 'node:fs/promises'
import { join } from 'node:path'
import { plot } from 'nodeplotlib'

const dir = argv[2]
if(!dir) {
	console.error("Please specify a Logs directory")
	exit(1)
}

// Maps debuff caster's level to hit rating of dispeller
let [successes, failures] = [
	{ 80: [], 81: [], 82: [], 83: [] },
	{ 80: [], 81: [], 82: [], 83: [] },
]
const files = await readdir(dir)
for(const file of files) {
	if(file.match(/^WoWCombatLog.+\.txt$/)) {
		const fd = await open(join(dir, file))
		let inEncounter = false
		// auras: maps debuff target+spellID as a compound index to debuff caster's level
		// hitRatings: maps dispeller to their hit rating
		// levels: maps debuff casters to their level
		let [auras, hitRatings, levels] = [{}, {}, {}]
		for await (const line of fd.readLines()) {
			const eventInfo = line.split(/(?:,|  )/)
			const subevent = eventInfo[1]
			if (!subevent) continue

			const [encounter, state] = subevent.match(/ENCOUNTER_(\w+)/) || []
			if(encounter) {
				if(state == "START") {
					inEncounter = true;
					[auras, hitRatings, levels] = [{}, {}, {}]
				} else {
					inEncounter = false
				}
			}
			if (!inEncounter) continue

			if(subevent == "COMBATANT_INFO") {
				const {2: sourceGUID, 18: hitRating} = eventInfo
				hitRatings[sourceGUID] = hitRating
			}

			if(subevent == "SPELL_CAST_SUCCESS") {
				const {2: sourceGUID, 28: level} = eventInfo
				if(level >= 80 && level <= 83) {
					levels[sourceGUID] = level
				}
			}

			const [aura, outcome] = subevent.match(/SPELL_AURA_(\w+)/) || []
			if(aura) {
				const {2: sourceGUID, 6: destGUID, 10: spellId} = eventInfo
				const key = destGUID + spellId
				if(outcome == "APPLIED" && levels[sourceGUID]) {
					auras[key] = levels[sourceGUID]
				} else if(outcome == "REMOVED") {
					//delete auras[key]
				}
			}

			const [dispel, failed] = subevent.match(/SPELL_DISPEL(_FAILED)?/) || []
			if(dispel) {
				const {2: sourceGUID, 6: destGUID, 13: spellId} = eventInfo
				const key = destGUID + spellId
				const level = auras[key]
				const hitRating = hitRatings[sourceGUID]
				if(!level || !hitRating) continue
				if(failed) {
					failures[level].push(hitRating)
				} else {
					successes[level].push(hitRating)
				}
			}
		}
	}
}

//console.log("failures:", failures)
//console.log("successes:", successes)

const data = [
	{
		name: "Failures",
		type: "histogram",
		x: failures[83],
		autobinx: false,
		xbins: {
			start: 0,
			size: 26.23,
		},
		opacity: 0.75
	},
	{
		name: "Successes",
		type: "histogram",
		x: successes[83],
		autobinx: false,
		xbins: {
			start: 0,
			size: 26.23,
		},
		opacity: 0.75
	},
]

const layout = {
	title: "Dispel Successes/Failures of level 83 Boss Debuffs",
	xaxis: {title: "Hit Rating (1% Bins)"},
	yaxis: {title: "Count"},
	barmode: "stack"
}

plot(data, layout)
