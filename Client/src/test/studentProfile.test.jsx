import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import StudentProfile from '../pages/StudentProfile.jsx';
import {member2Api as api} from '../services/member2Api.js';
vi.mock('../services/member2Api.js',()=>({member2Api:{profile:vi.fn(),saveProfile:vi.fn()}}));
const profile={id:1,name:'Lisan Taslim',email:'lisan.taslim@g.bracu.ac.bd',gender:null,gender_verified:false};
const view=()=>render(<MemoryRouter><StudentProfile/></MemoryRouter>);
beforeEach(()=>{vi.resetAllMocks();api.profile.mockResolvedValue(profile);});
it('loads the authenticated profile with read-only identity and exactly two gender choices',async()=>{
 view();expect(await screen.findByLabelText('Name')).toHaveValue(profile.name);expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');expect(screen.getByLabelText('BRACU Email')).toHaveValue(profile.email);expect(screen.getAllByRole('radio')).toHaveLength(2);expect(screen.getByRole('radio',{name:'Male'})).not.toBeChecked();expect(screen.getByRole('radio',{name:'Female'})).not.toBeChecked();
});
for(const gender of ['male','female'])it(`saves only the chosen ${gender} value and shows verification feedback`,async()=>{
 const saved={...profile,gender,gender_verified:true};api.saveProfile.mockResolvedValue(saved);const {unmount}=view();fireEvent.click(await screen.findByRole('radio',{name:gender==='male'?'Male':'Female'}));fireEvent.click(screen.getByRole('button',{name:'Save Profile'}));
 await screen.findByText('Profile saved. Your gender is verified.');expect(api.saveProfile).toHaveBeenCalledExactlyOnceWith({gender});expect(screen.getByText('Verified')).toBeInTheDocument();
 unmount();api.profile.mockResolvedValue(saved);view();expect(await screen.findByRole('radio',{name:gender==='male'?'Male':'Female'})).toBeChecked();expect(screen.getByRole('link',{name:'Book a Seat'})).toHaveAttribute('href','/book');
});
it('requires an explicit choice and reports save errors without changing identity',async()=>{
 view();await screen.findByLabelText('Name');fireEvent.click(screen.getByRole('button',{name:'Save Profile'}));expect(screen.getByRole('alert')).toHaveTextContent('Select Male or Female');expect(api.saveProfile).not.toHaveBeenCalled();
 api.saveProfile.mockRejectedValue(new Error('Profile could not be saved'));fireEvent.click(screen.getByRole('radio',{name:'Male'}));fireEvent.click(screen.getByRole('button',{name:'Save Profile'}));await screen.findByText('Profile could not be saved');expect(screen.getByLabelText('Name')).toHaveValue(profile.name);expect(screen.getByRole('button',{name:'Save Profile'})).toBeEnabled();
});
it('offers retry if the profile could not be loaded',async()=>{
 api.profile.mockRejectedValueOnce(new Error('Profile unavailable'));view();await screen.findByText('Profile unavailable');fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByLabelText('Name');expect(api.profile).toHaveBeenCalledTimes(2);
});
